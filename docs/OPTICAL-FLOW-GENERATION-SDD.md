# SDD — In-Browser Optical Flow Generation (WASM)

**Status:** approved design, ready for implementation
**Scope:** flowiz browser viewer (`viewer/`) only — no Python changes
**Audience:** the implementing agent. Read this whole document before writing code. Section 12 (Risks & pitfalls) is mandatory reading; every item there has caused real-world failures in similar stacks.

---

## 1. Feature overview

Let users drop a **video** file onto the viewer and *generate* optical flow client-side, entirely within WebAssembly, with three selectable model tiers:

| Tier | Model | Runtime | Download | Speed @480p (wasm CPU) | Quality |
|---|---|---|---|---|---|
| **Fastest** | DIS optical flow (`cv.DISOpticalFlow`) | custom slim opencv.js | ~3 MB | 10–50 ms/pair | classical, smooth |
| **Optimal** | RAFT-small (int8, fixed-shape ONNX) | onnxruntime-web | ~5 MB model | 1–4 s/pair (0.1–0.3 s WebGPU) | Sintel EPE ≈ 2.2–3.3 |
| **Best** | RAFT-large ONNX | onnxruntime-web | ~6–20 MB model | 5–15 s/pair (0.3–1 s WebGPU) | Sintel EPE ≈ 1.4–1.6 |

Pipeline: video decoded frame-by-frame → consecutive frame pairs run through the selected flow engine **in a Web Worker** → resulting `FlowField[]` feeds the existing `showFrames()` pipeline unchanged (filmstrip, playback, inspector all work for free) → a new **Export menu** writes:

- **PNG** — current colorized frame (existing behavior, kept)
- **Raw flow ZIP** — every raw format the viewer parses: `.flo`, KITTI 16-bit `.png`, `.pfm`, `.npy`, plus colorized 8-bit PNGs
- **MP4 animation** — WebCodecs `VideoEncoder` + Mediabunny mux
- **GIF animation** — gifenc

The ZIP/MP4/GIF exports work for *any* loaded sequence, not just generated ones — this is deliberate and gives the export work standalone value.

### Decisions already made (do not re-litigate)

1. Fastest tier = **DIS via a custom slim opencv.js build** (DIS is *not* in the stock opencv.js whitelist), vendored prebuilt into the repo with a documented Docker build recipe (§5.1).
2. **WebGPU is an optional, auto-detected accelerator** for the ONNX tiers; single-threaded pure-wasm EP is the guaranteed fallback everywhere.
3. **Models committed plainly** into `viewer/public/models/` (all <50 MB). **No Git LFS** — GitHub Pages branch deploys do not resolve LFS pointers.
4. Raw export = `.flo` + KITTI `.png` + `.pfm` + `.npy` (no `.flo5`; HDF5-in-browser rejected). Zip via `fflate`.
5. Video decode = WebCodecs + Mediabunny demux, with a `<video>`-seek canvas fallback. MP4 encode via Mediabunny, GIF via gifenc.

### Hard constraint

GitHub Pages is static and **cannot set COOP/COEP headers** → no `SharedArrayBuffer`, no threads. Everything must be **single-threaded wasm**: `ort.env.wasm.numThreads = 1`, opencv.js built without `--threads`. A coi-serviceworker shim was considered and rejected (fragile first-load reload). Do not enable threading anywhere.

---

## 2. Existing contracts to preserve

The viewer is a Vite + TypeScript vanilla SPA (no framework; only runtime dep today is `pako`). Key contracts:

- `FlowField` (`viewer/src/flow.ts:5`): `{ width, height, data: Float32Array /* interleaved u,v row-major */, valid?: Uint8Array, name: string }`.
- Parsers in `flow.ts`: `parseFlo` (:29, tag `202021.25`), `parsePfm` (:46, bottom-up rows, 3rd channel = validity), `parseNpy` (:81), `parseKittiPng` (:136, `(val−32768)/64`, channel 3 = valid), custom `decodePng` (:164) reading 16-bit samples as `(hi<<8)|lo`. Dispatcher `parseByName` (:269).
- CPU colorizer `uvToColor` in `viewer/src/colorwheel.ts:61` — bit-compatible with Python `flowiz.core.colorize`. **No DOM dependencies** → safe to import in a worker.
- Frames pipeline in `viewer/src/main.ts`: `handleFiles` (:310) → `showFrames` (:336) → filmstrip/playback. Playback fps slider default 8.
- Rendering: WebGL2 `FlowRenderer` (`viewer/src/render.ts`), `preserveDrawingBuffer: true`; PNG export via `canvas.toBlob` (main.ts:538).
- Deploy: `.github/workflows/pages.yml` builds `viewer/dist` to the Pages site root. `vite.config.ts` uses `base: "./"`. Everything in `viewer/public/` is copied into `dist/` verbatim.
- UI rule: **inline SVG icons only, never emoji.**

---

## 3. Module layout

All new files under `viewer/src/` unless noted:

```
video/
  decode.ts          # VideoFrameSource: Mediabunny demux + WebCodecs; <video>-seek fallback
flowgen/
  types.ts           # worker message protocol + option types (imported by BOTH sides)
  engine.ts          # main-thread facade over the worker
  worker.ts          # Web Worker entry: inference + heavy encoding
  dis.ts             # DIS via opencv.js (runs inside worker)
  raft.ts            # RAFT via onnxruntime-web (runs inside worker)
  letterbox.ts       # pure resize/letterbox + flow-vector rescale math (unit-testable)
export/
  writers.ts         # encodeFlo / encodeKittiPng / encodePfm / encodeNpy (pure)
  png16.ts           # 16-bit big-endian RGB PNG encoder (pako deflate + chunks + crc32)
  zip.ts             # buildRawZip via fflate
  colorize.ts        # FlowField -> RGBA using colorwheel.uvToColor (CPU, worker-safe)
  mp4.ts             # WebCodecs VideoEncoder + Mediabunny mux (in worker)
  gif.ts             # gifenc, single global palette (in worker)
ui/
  generate-panel.ts  # generation modal: tier picker, options, progress, cancel
  export-menu.ts     # replaces the single "Export PNG" button with a dropdown
```

Static assets:

```
viewer/public/vendor/opencv/opencv-dis.js     # slim custom build, MODULARIZE + EXPORT_ES6
viewer/public/vendor/opencv/opencv-dis.wasm   # ~3 MB
viewer/public/vendor/opencv/README.md         # build recipe (§5.1)
viewer/public/models/raft-small-int8-360x480.onnx
viewer/public/models/raft-large-360x480.onnx
viewer/public/models/README.md                # provenance + preprocessing table (§5.2)
# onnxruntime-web wasm assets are copied into dist/vendor/ort/ at build time (§9)
```

`main.ts` changes stay thin: extend file-input accept, partition video files in `handleFiles`, mount the two UI modules.

---

## 4. Worker architecture & message protocol

### 4.1 Topology

One persistent **module worker**:

```ts
const worker = new Worker(new URL("./flowgen/worker.ts", import.meta.url), { type: "module" });
```

(The `new URL(...)` argument **must be a literal** — Vite statically analyzes it.)

The worker hosts: opencv.js and/or ORT sessions (lazy-loaded per tier, kept alive for reuse), flow inference, and the CPU-heavy encoders (colorize, PNG16, zip, GIF, MP4 — `VideoEncoder` is available in workers).

**Video decoding stays on the main thread** — the `<video>`-seek fallback needs DOM. Decoded RGBA frames transfer to the worker via transfer lists (zero-copy).

### 4.2 Protocol (`flowgen/types.ts`)

Critical design point: **send single frames, not pairs**. The worker caches the previous frame and emits flow for index ≥ 1. This avoids the detached-buffer trap: frame *i* would be needed as both `b` of pair *i−1* and `a` of pair *i*, but its buffer is detached after the first transfer.

```ts
export type ModelTier = "dis" | "raft-small" | "raft-large";

export interface GenOptions {
  tier: ModelTier;
  disPreset?: "ultrafast" | "fast" | "medium";  // DIS only; UI default "fast"
  raftIters?: number;                            // if the export supports it; else baked
  ep: "auto" | "wasm" | "webgpu";                // default "auto"
}

export interface RGBAFrame {
  width: number; height: number;
  data: ArrayBuffer;          // RGBA8, width*height*4 — always in the transfer list
  timestampUs: number;
}

export interface SerializedFlow {
  width: number; height: number;
  data: ArrayBuffer;          // Float32 interleaved u,v
  valid?: ArrayBuffer;
  name: string;
}

export type WorkerRequest =
  | { type: "init"; id: number; opts: GenOptions; baseUrl: string }
  | { type: "frame"; id: number; index: number; frame: RGBAFrame }
  | { type: "encode-zip"; id: number; frames: SerializedFlow[]; baseName: string }
  | { type: "encode-gif"; id: number; frames: SerializedFlow[]; fps: number; sharedMax: number }
  | { type: "encode-mp4"; id: number; frames: SerializedFlow[]; fps: number; sharedMax: number; codec: string }
  | { type: "dispose" };

export type WorkerResponse =
  | { type: "ready"; id: number; ep: "wasm" | "webgpu" }
  | { type: "flow"; id: number; index: number; flow: SerializedFlow }
  | { type: "progress"; id: number; phase: string; done: number; total: number }
  | { type: "blob"; id: number; buffer: ArrayBuffer; mime: string; filename: string }
  | { type: "error"; id: number; message: string };
```

`baseUrl` in `init` is an **absolute URL** computed on the main thread:
`new URL(import.meta.env.BASE_URL, location.href).href` — the worker cannot resolve `base: "./"` itself.

### 4.3 Main-thread facade (`flowgen/engine.ts`)

```ts
export class FlowEngine {
  init(opts: GenOptions): Promise<{ ep: "wasm" | "webgpu" }>;
  pushFrame(frame: RGBAFrame, index: number): Promise<FlowField | null>; // null for index 0
  encodeZip(frames: FlowField[], baseName: string): Promise<Blob>;
  encodeGif(frames: FlowField[], fps: number): Promise<Blob>;
  encodeMp4(frames: FlowField[], fps: number): Promise<Blob>;
  onProgress?: (phase: string, done: number, total: number) => void;
  dispose(): void;   // terminates the worker — this is also how Cancel works
}
```

Exactly **one in-flight inference** at a time (serialize internally) to bound wasm heap usage. Request/response matching by `id`.

---

## 5. Inference tiers

### 5.1 DIS (`flowgen/dis.ts`)

Vendored slim opencv.js built with `MODULARIZE=1 EXPORT_ES6=1` so the module worker can load it:

```ts
const factory = (await import(/* @vite-ignore */ baseUrl + "vendor/opencv/opencv-dis.js")).default;
const cv = await factory({ locateFile: () => baseUrl + "vendor/opencv/opencv-dis.wasm" });
```

API:

```ts
export async function createDis(baseUrl: string, preset: GenOptions["disPreset"]): Promise<{
  compute(a: RGBAFrame, b: RGBAFrame): FlowField;  // synchronous inside, fast
  dispose(): void;
}>;
```

Per pair: `cv.matFromImageData`-equivalent (build a Mat from the RGBA bytes) → `cv.cvtColor(RGBA2GRAY)` → `dis.calc(g0, g1, flowMat)` → **copy** `flowMat.data32F` into a fresh `Float32Array` (OpenCV's 2-channel CV_32FC2 is already interleaved u,v — matches `FlowField.data` directly). Presets map to `cv.DISOPTICAL_FLOW_PRESET_ULTRAFAST | _FAST | _MEDIUM`.

**Mat hygiene:** allocate `g0`, `g1`, `flow` once as closure state and reuse across pairs; `dispose()` deletes them. Every temporary Mat goes in `try/finally` with `.delete()`. Leaks show up as silent heap growth then `abort(OOM)`.

Build recipe → `viewer/public/vendor/opencv/README.md`:

```bash
git clone --depth 1 --branch 4.10.0 https://github.com/opencv/opencv
# Edit platforms/js/opencv_js.config.py:
#   - trim the whitelist to: core Mat basics, imgproc {cvtColor, resize}, and video with
#     'DISOpticalFlow': ['create','calc','setFinestScale','setPatchSize','setPatchStride',
#                        'setGradientDescentIterations','setVariationalRefinementIterations']
docker run --rm -v $PWD/opencv:/src -u $(id -u):$(id -g) emscripten/emsdk:3.1.64 \
  python3 /src/platforms/js/build_js.py /src/build_js \
  --build_wasm --disable_single_file \
  --cmake_option="-DBUILD_LIST=core,imgproc,video"
# NOTE: add MODULARIZE=1 EXPORT_ES6=1 to the emscripten link flags (build_js.py --build_flags
# or patch the generated CMake) so the output is ES-module-loadable in a worker.
# Verify: grep -c DISOpticalFlow build_js/bin/opencv.js   (must be > 0)
# Do NOT pass --threads (no COOP/COEP on Pages). --simd is fine and recommended.
```

`--disable_single_file` keeps the `.wasm` separate so it streams/compiles properly.

### 5.2 RAFT (`flowgen/raft.ts`)

```ts
export async function createRaft(baseUrl: string, tier: "raft-small" | "raft-large",
  ep: GenOptions["ep"], iters: number | undefined): Promise<{
  compute(a: RGBAFrame, b: RGBAFrame): Promise<FlowField>;
  ep: "wasm" | "webgpu";
  dispose(): void;
}>;
```

- `import * as ort from "onnxruntime-web"` (bundled by Vite). Configure:
  `ort.env.wasm.wasmPaths = baseUrl + "vendor/ort/"` and `ort.env.wasm.numThreads = 1`.
- **EP selection:** if `ep !== "wasm"` and `navigator.gpu` exists (note: check `self.navigator.gpu` in the worker), create the session with `executionProviders: ["webgpu", "wasm"]`; on session-creation failure, retry with `["wasm"]`. Report the winner in the `ready` message.
- **Models** (fixed shape **360×480**), committed under `viewer/public/models/`:
  - `raft-small-int8-360x480.onnx` (~5 MB) — source: HuggingFace `opencv/optical_flow_estimation_raft` (has fp32 + int8 block-quantized variants) or export from `torchvision.models.optical_flow.raft_small`.
  - `raft-large-360x480.onnx` (~6–20 MB depending on fp16/int8) — same sources, `raft_large`.
  - `models/README.md` must record for each file: exact source URL/commit, input tensor names + layout, pixel range, output name, baked iteration count, license.
- **Per-model config object** — never hardcode preprocessing:

```ts
interface RaftModelConfig {
  url: string; inputW: 480; inputH: 360;
  inputNames: [string, string]; outputName: string;
  layout: "NCHW";
  pixelRange: "[-1,1]" | "[0,255]";  // torchvision exports want 2*(x/255)-1; OpenCV-zoo int8 wants raw [0,255]
}
```

- **Fixed-shape handling** (`flowgen/letterbox.ts`, pure functions):

```ts
export interface LetterboxPlan { scale: number; padX: number; padY: number; drawW: number; drawH: number }
export function planLetterbox(srcW: number, srcH: number, dstW: number, dstH: number): LetterboxPlan;
export function unletterboxFlow(flow: Float32Array, plan: LetterboxPlan,
  srcW: number, srcH: number): Float32Array;
// crop the padded region, bilinear-resize both channels to srcW×srcH,
// then u *= srcW/plan.drawW and v *= srcH/plan.drawH  (vectors scale with the resize!)
```

  Preprocess: draw the RGBA frame onto an `OffscreenCanvas(480, 360)` with aspect-preserving fit and black padding → `getImageData` → convert to NCHW float32 per the model config. Postprocess: output `(1,2,360,480)` → `unletterboxFlow`.
- **Session reuse:** create the `InferenceSession` once in `init`; preallocate input `Float32Array`s and wrap in `ort.Tensor` per call. Validate tensor dims before `run()` — wrong dims throw cryptic errors deep inside ORT.

---

## 6. Export writers — exact binary layouts

All pure `FlowField → Uint8Array` functions in `export/writers.ts`. Each must round-trip through the **existing parser** in `flow.ts` — write the tests first (§10).

### `encodeFlo`
```
[float32 LE 202021.25] [int32 LE width] [int32 LE height] [width*height*2 × float32 LE, interleaved u,v, row-major top-down]
```

### `encodeKittiPng`
Per pixel: `R = clamp(round(u*64 + 32768), 0, 65535)`, `G = clamp(round(v*64 + 32768), 0, 65535)`, `B = valid ? 1 : 0` (from `f.valid` if present, else all-valid). **Invalid pixels must write R = G = 0** (the parser treats `B > 0` as valid). Encode as 16-bit colorType-2 RGB PNG via `encodePng16`.

### `encodePfm`
Header `"PF\n{w} {h}\n-1.0\n"` (scale −1.0 ⇒ little-endian floats), then float32 rows **bottom-up** (last image row first), 3 channels per pixel: `u, v, valid (1.0/0.0)`. Mirror `parsePfm` exactly — it flips and reads channel 3 as validity.

### `encodeNpy`
`\x93NUMPY` + version `1.0` + little-endian uint16 header length + header string
`{'descr': '<f4', 'fortran_order': False, 'shape': (H, W, 2), }` padded with spaces (`0x20`) so that `10 + headerLen` is a multiple of **64**, terminated with `\n`. Then raw little-endian float32 data (interleaved u,v is exactly `(H, W, 2)` C-order — `f.data` verbatim).

### `export/png16.ts`
```ts
export function encodePng16(width: number, height: number,
  samples: Uint16Array /* length w*h*3, RGB row-major */): Uint8Array;
```
- PNG signature; IHDR (bitDepth 16, colorType 2, compression 0, filter 0, interlace 0); one IDAT containing `pako.deflate` of the scanline stream; IEND.
- Scanlines: each row = filter byte `0` + `width*3` samples written **big-endian** (`hi = v >> 8`, `lo = v & 0xff`) — the existing decoder at `flow.ts:251` reads `(hi<<8)|lo`. Filter 0 everywhere (KITTI data is noise-like; simplicity beats compression).
- Implement CRC32 yourself (standard 256-entry table, ~15 lines) — pako does not export one. Each chunk's CRC covers chunk type + data.

### `export/zip.ts`
```ts
export function buildRawZip(frames: FlowField[], colorPngs: Uint8Array[], baseName: string): Uint8Array;
```
fflate `zipSync` with layout `flow/0001.flo`, `kitti/0001.png`, `pfm/0001.pfm`, `npy/0001.npy`, `color/0001.png` (4-digit 1-based indices). Deflate level 6 for flo/npy/pfm; level 0 (store) for the PNGs (already deflated).

---

## 7. Video decode (`video/decode.ts`)

```ts
export interface FrameSourceOptions { stride: number; maxDim: number; maxFrames?: number }
export interface VideoFrameSource {
  readonly frameCount: number | null;  // null until known; fallback estimates duration*fps/stride
  readonly fps: number;
  frames(): AsyncGenerator<RGBAFrame>; // already stride-subsampled + downscaled
  close(): void;
}
export async function openVideo(file: File, opts: FrameSourceOptions): Promise<VideoFrameSource>;
```

- **Primary path:** Mediabunny `Input` + `BlobSource` → `getPrimaryVideoTrack()` + `canDecode()` probe → `CanvasSink` (handles rotation metadata and downscaling) iterating samples → `getImageData` → `RGBAFrame`.
- **Fallback** (no WebCodecs support): hidden `<video preload="auto" muted playsinline>` with `URL.createObjectURL(file)`; seek to `t = i*stride/fps`; await `requestVideoFrameCallback` where available (`seeked` can fire before the frame paints); `drawImage` → `getImageData`. fps from metadata if obtainable, else assume 30.
- `maxDim` (UI: 360 / 480 / 720 / native; **default 720**) is the *single* place output resolution is decided. DIS runs at that size natively; RAFT letterboxes from it.

---

## 8. MP4 / GIF / colorize

- `sequenceMaxFlow(frames: FlowField[]): number` — max magnitude across the whole sequence. This shared normalizer matches Python `write_video`'s flicker-free semantics and makes exports deterministic (independent of the UI max-flow slider).
- `export/colorize.ts` — `colorizeFlow(f: FlowField, maxFlow: number): Uint8ClampedArray` (RGBA). Pure CPU using `uvToColor` from `colorwheel.ts`. **Do not** use GPU readback from the renderer (it normalizes per the current slider and lives on the main thread; CPU is deterministic and testable).
- **MP4** (`export/mp4.ts`, in worker): Mediabunny `Output` + `Mp4OutputFormat` + `BufferTarget`. Probe codecs in order `avc1.42001f` (H.264 baseline — **pad dimensions to even**), `vp09.00.10.08`, `av01.0.04M.08` via `VideoEncoder.isConfigSupported` before configuring. fps = the UI playback fps (default 8). Bitrate ≈ `w*h*fps*0.15` bps, capped at 8 Mbps. Build `VideoFrame`s from an `OffscreenCanvas` (not from `ImageData` — Safari). Flush encoder, finalize mux, return the buffer.
- **GIF** (`export/gif.ts`, in worker): gifenc. `quantize()` on the **first** frame only → one global palette (flow colorization is smooth; a stable palette avoids per-frame palette flicker) → `applyPalette` per frame → `writeFrame(..., { palette, delay: Math.round(1000/fps) })`. Cap at ~480 px width and ~300 frames, with a confirm dialog above the caps.

---

## 9. UI/UX

### Input
- Extend the file input accept to add `.mp4,.webm,.mov,.mkv,.avi`; dropzone subtitle gains "or drop a video to generate flow".
- In `handleFiles` (main.ts:310): partition — `f.type.startsWith("video/") || /\.(mp4|webm|mov|mkv|avi)$/i.test(f.name)`. First video → `openGeneratePanel(file)`; remaining non-video files → existing parse path.

### Generate panel (`ui/generate-panel.ts`)
Modal card over the stage, reusing `.loader-card` styling:

- Video summary line: name, duration, resolution, **live-updating** estimated pair count `⌈N/stride⌉ − 1` as options change.
- Tier segmented control with download sizes: "Fastest — DIS (~3 MB)" / "Optimal — RAFT-small (~5 MB)" / "Best — RAFT-large (~20 MB)". Persist choice in `localStorage`.
- Options: stride 1/2/4/8; resolution 360p/480p/720p/native (warn above 1080 — wasm heap); RAFT iterations as an "advanced" slider if the model export takes iters as input, hidden otherwise.
- Backend badge after init: "WebGPU" or "WASM".
- Progress: reuse the loader bar. Phases: "Loading model" (drive from `fetch` + ReadableStream byte progress), then "Computing flow (k / N)". **Cancel** button → `engine.dispose()` (terminates the worker) + `source.close()`.
- Orchestration:

```ts
const src = await openVideo(file, { stride, maxDim });
await engine.init(opts);
const flows: FlowField[] = [];
let i = 0;
for await (const frame of src.frames()) {
  const flow = await engine.pushFrame(frame, i++);   // frame buffer is transferred — never touch it again
  if (flow) { flow.name = `${stem}_${String(flows.length + 1).padStart(4, "0")}.flo`; flows.push(flow); }
  // progress...
}
showFrames(flows);   // existing pipeline takes over
```

Keep `flows` + chosen fps in module state for the export menu.

### Export menu (`ui/export-menu.ts`)
Replace the single `#export` button with a split button/dropdown:

| Item | Availability |
|---|---|
| PNG (current frame) | always (existing code path) |
| Raw flow ZIP | always — works for loaded files too |
| MP4 | only if `"VideoEncoder" in self` and a codec probes OK; otherwise disabled with a tooltip |
| GIF | always |

Inline SVG icons only. Downloads via object URL + `<a download>` like the existing PNG export.

---

## 10. Build & deploy changes

### `package.json`
```jsonc
"dependencies": {
  "pako": "^2.1.0",
  "onnxruntime-web": "1.20.1",   // PIN EXACTLY — wasm asset filenames change across minors
  "mediabunny": "^1.0.0",
  "gifenc": "^1.0.3",
  "fflate": "^0.8.2"
},
"devDependencies": { /* + */ "vite-plugin-static-copy": "^1.0.0" }
```
(Pin `onnxruntime-web` to the latest stable at implementation time; the point is *exact* pinning, not the specific number.)

### `vite.config.ts`
- `vite-plugin-static-copy`: copy `node_modules/onnxruntime-web/dist/*.wasm` (including the `.jsep.wasm` WebGPU variant) → `dist/vendor/ort/`. Also make dev-server serving work (staticCopy handles dev via middleware).
- `build.target: "es2022"`; `worker: { format: "es" }`; `optimizeDeps: { exclude: ["onnxruntime-web"] }` (its wasm loader confuses esbuild pre-bundling in dev).
- `worker.ts` needs `/// <reference lib="webworker" />`.

### Models & repo size
Commit opencv (~3 MB), RAFT-small (~5 MB), RAFT-large (~6–20 MB) plainly — total ~30 MB, every file <50 MB. **Do not use Git LFS**: Pages branch deploys don't resolve LFS pointers. (If a larger model ever arrives: the artifact-deploy flow in `pages.yml` *can* serve LFS content if `actions/checkout` gets `lfs: true` — document this in `models/README.md`, don't do it now.)

### `pages.yml`
**No changes required** — `public/` is copied into `dist/` which is already deployed wholesale.

---

## 11. Testing (vitest — pattern: existing `colorwheel.test.ts`)

- **`export/writers.test.ts`** — round-trip through the existing parsers, using **w ≠ h** fields everywhere (catches row-flip/transpose bugs):
  - `parseFlo(encodeFlo(f).buffer, "x.flo")` — exact Float32 equality.
  - `parseKittiPng(encodeKittiPng(f).buffer, ...)` — values within 1/64 quantization; valid mask round-trips; include an invalid-pixel case (expect R=G=0 written, valid=0 read).
  - `parsePfm(encodePfm(f).buffer, ...)` — exact floats, validity round-trip.
  - `parseNpy(encodeNpy(f).buffer, ...)` — exact; assert `(10 + headerLen) % 64 === 0`.
- **`export/png16.test.ts`** — encode → decode via the KITTI path; CRC correctness proven by round-trip (the parser's `decodePng` doesn't verify CRC, so also hand-check one known CRC vector, e.g. `crc32("IEND") === 0xAE426082`).
- **`flowgen/letterbox.test.ts`** — identity when aspect ratios match; known scale/pad numbers for 1920×1080 → 480×360; vector rescale on a synthetic uniform flow field.
- **Integration smoke** (manual, `vite preview`): drop a short mp4 → DIS tier → verify pair count = ⌈N/stride⌉−1, playback works; export ZIP; re-drop the extracted `.flo` into the viewer and confirm identical rendering.

---

## 12. Risks & pitfalls — READ BEFORE CODING

1. **Detached buffers.** Any `ArrayBuffer` in a `postMessage` transfer list is unusable afterward. The single-frame protocol (worker caches prev) exists precisely for this; never keep a reference to a transferred `RGBAFrame`.
2. **No threads, ever.** GitHub Pages cannot serve COOP/COEP. `ort.env.wasm.numThreads = 1`; opencv built without `--threads`. If you see `SharedArrayBuffer is not defined`, you've pulled a threaded asset.
3. **wasm memory.** opencv.js and ORT keep separate heaps. Native-4K DIS blows the default heap — default `maxDim` 720, warn >1080. RAFT correlation volume scales ~quadratically with resolution; 360×480 fixed input keeps this safe. One in-flight inference only.
4. **cv.Mat leaks.** Every Mat needs `.delete()`; use try/finally. Symptom: silent heap growth → `abort(OOM)` after N frames.
5. **Fixed ONNX shapes.** Validate input tensor dims before `session.run()`; a mismatch throws a cryptic ORT-internal error.
6. **Flow vectors scale with resizing.** After resizing flow from model space back to source space, multiply u by `srcW/drawW` and v by `srcH/drawH`. Forgetting this yields plausible-looking but wrong magnitudes.
7. **Per-model preprocessing differs.** torchvision RAFT exports expect `[-1,1]`; OpenCV-zoo int8 expects `[0,255]`. Drive everything from `RaftModelConfig` — never hardcode.
8. **16-bit PNG samples are big-endian** in the stream (`flow.ts:251` reads `(hi<<8)|lo`). **PFM rows are bottom-up** and scale `-1.0` means little-endian. **KITTI invalid pixels write R=G=0** and values clamp to [0,65535]. **npy header** must pad to a 64-byte boundary and end with `\n`. All four are covered by round-trip tests — write the tests first.
9. **WebCodecs quirks.** Always `VideoEncoder.isConfigSupported` before `configure`. H.264 requires even dimensions — pad. Construct `VideoFrame` from `OffscreenCanvas`, not `ImageData` (Safari). The `<video>` fallback needs `muted playsinline preload="auto"`, and `seeked` may fire before the frame paints — prefer `requestVideoFrameCallback`.
10. **Vite worker gotchas.** `new Worker(new URL("./flowgen/worker.ts", import.meta.url), {type:"module"})` with a *literal* URL. Dynamic `import()` of public-dir scripts needs `/* @vite-ignore */`. `worker: { format: "es" }` in config.
11. **onnxruntime-web pinning.** Exact-pin the version; the static-copied wasm filenames (`ort-wasm-simd-threaded.wasm` vs `.jsep.wasm`, names shift between minors) fail only at runtime with "failed to fetch wasm" if mismatched.
12. **BASE_URL in the worker.** `base: "./"` is meaningless inside a worker blob — pass the absolute `baseUrl` in the `init` message (computed on the main thread) and prefix *every* runtime fetch (models, opencv, ort wasm) with it.
13. **Git LFS trap.** Do not LFS anything served by Pages.
14. **GIF palette flicker.** One global palette from the first frame — per-frame quantization makes smooth flow animations shimmer.

---

## 13. Implementation order

1. `export/writers.ts` + `export/png16.ts` + tests — pure, no new deps beyond pako; immediately unlocks raw export for already-loaded files.
2. `export/zip.ts`, `export/colorize.ts`, `ui/export-menu.ts` + main.ts wiring (add `fflate`).
3. `video/decode.ts` (add `mediabunny`).
4. `flowgen/types.ts` + `worker.ts` + `engine.ts` + `dis.ts` + vendored opencv.js — **first end-to-end generation path**.
5. `ui/generate-panel.ts` + main.ts wiring.
6. `flowgen/raft.ts` + `letterbox.ts` + ORT asset copying + models (add `onnxruntime-web`).
7. `export/gif.ts` + `export/mp4.ts` (add `gifenc`).
8. Docs: `public/vendor/opencv/README.md` (build recipe), `public/models/README.md` (provenance + preprocessing), README viewer section update.

Each step leaves the viewer shippable. Run `npm run build` (tsc + vite) and `npx vitest run` after every step.
