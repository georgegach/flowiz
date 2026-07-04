# flowiz v3.0 — PRD + SDD

**Status:** Approved for implementation
**Author:** Giorgi Gachechiladze (product) + Claude (spec)
**Date:** 2026-07-04
**Implementer:** Claude Opus — this document is the single source of truth. Where it is silent, follow the "Design principles" section rather than inventing scope.

---

# Part I — Product Requirements Document

## 1. Vision

flowiz began (2019) as the friendliest way to turn Middlebury `.flo` files into color-wheel PNGs. Since then, optical flow research moved to RAFT, GMFlow, FlowFormer, SEA-RAFT and datasets like KITTI-2015, MPI-Sintel and Spring — and researchers today juggle `.flo`, 16-bit KITTI PNGs, `.pfm`, `.npy` dumps and raw PyTorch tensors, then hand-roll the same Baker et al. color wheel in every repo. flowiz v3 becomes **the canonical Python toolkit and browser viewer for optical-flow visualization**: read any flow format, render publication-quality visualizations, compute error maps against ground truth, compile temporally-consistent videos — and drag-drop any flow file into a zero-backend web viewer.

## 2. Goals & non-goals

**Goals**
1. Read/write every mainstream flow format; accept numpy arrays and torch tensors directly.
2. Publication-grade visualization: Baker/Middlebury color wheel (bit-exact with `flow_vis`), vector overlays, legends, error maps, comparison grids.
3. Fast: vectorized + cached colorization; multiprocess batch conversion; streams 4K sequences to video without holding frames in RAM.
4. Modern DX: typed API, `pyproject.toml`, pytest, ruff, CI publish, MkDocs site, rich `flowiz` CLI with subcommands.
5. A fully client-side viewer (GitHub Pages) — files never leave the user's machine.
6. Discoverability: SEO-grade metadata/README, docs site, CITATION.cff + Zenodo DOI, example notebooks.

**Non-goals**
- Computing optical flow (no models, no inference).
- Any server-side/hosted conversion service. The old Eel GUI and Docker web app are removed.
- Windows-specific GUI packaging.

## 3. Users & jobs-to-be-done

| User | Job |
|---|---|
| CV researcher | "Visualize my model's output tensor next to ground truth with an EPE heatmap, for a paper figure." |
| Grad student | "I downloaded KITTI/Sintel; let me *see* the ground-truth flow quickly." |
| Engineer | "Batch-convert 10k `.flo` frames to a video in CI." |
| Reviewer / casual | "Drag this `.flo` onto a web page and inspect vectors per-pixel." |

## 4. Feature requirements

### F1 — Format I/O (P0)
- **Read:** `.flo` (Middlebury), KITTI 16-bit PNG (`uint16`, valid mask in channel 3), `.pfm` (2- and 3-channel), `.npy`/`.npz` (HW2 or 2HW auto-detected), `.flo5`/HDF5 (Spring dataset, optional extra check at runtime with clear error), torch tensors (CHW/HWC, batched → list), and generic images rejected with a helpful message.
- **Write:** `.flo`, KITTI PNG, `.npy`.
- Auto-detection by extension + magic bytes; `flowiz.read(path)` just works.
- All readers return `Flow` object (§SDD 2.1) carrying data + optional validity mask + provenance metadata.

### F2 — Visualization (P0)
- `colorize()` — Baker et al. color wheel, output identical (±1 LSB) to the reference `flow_vis` implementation; options: `max_flow` (None = per-frame max, float = fixed, `"sequence"` handled by batch API), `saturate` clipping, `mask_invalid` (render invalid px black), `convention` (`"middlebury"` default, `"hsv"` alternative).
- `quiver()` — arrow/vector overlay rendered onto the colorized image or a background frame; density, scale, color options. Pure-numpy line rasterization or matplotlib backend (matplotlib is a normal dependency — batteries included).
- `wheel_legend()` — returns the color-wheel key image; `colorize(..., legend=True)` embeds it in a corner.
- **Temporal consistency:** `colorize_sequence(flows)` normalizes by the sequence-wide max so videos don't flicker (the #1 defect of v2).
- Alternative encodings: UV channel split (kept from v2), magnitude heatmap, angle map.

### F3 — Evaluation & comparison (P0)
- `epe(pred, gt)` per-pixel end-point-error array + summary stats; respects validity masks.
- `fl_score(pred, gt)` KITTI Fl outlier metric (>3px and >5%).
- `error_map()` — EPE heatmap (sequential colormap, colorbar optional).
- `compare_grid(pred, gt)` — one-call figure: pred | gt | error map, labeled, savable PNG. This is the "paper figure" money shot.

### F4 — Batch & video (P0)
- `flowiz convert 'flows/*.flo' -o out/ --workers 8` — multiprocessing, rich progress bar.
- `flowiz video 'flows/*.flo' -o flow.mp4 -r 24 --normalize sequence` — streams frames through `imageio-ffmpeg` (no `os.system`, no shell injection, no intermediate PNGs required; `--keep-frames` optionally writes them). GIF output supported via `.gif` extension.
- Natural-sort frame ordering.

### F5 — CLI (P0)
`flowiz` console entry point (Typer + Rich):
- `flowiz convert` — files → images (png; `--mode rgb|uv|mag|angle`).
- `flowiz video` — files → mp4/gif.
- `flowiz info file.flo` — header, shape, min/max/mean magnitude, invalid-pixel count, pretty table.
- `flowiz compare pred.flo gt.flo` — EPE/Fl stats + optional `--save grid.png`.
- `flowiz view` — opens the bundled static viewer via `webbrowser` + local static file server (the viewer build is shipped in the wheel; GitHub Pages URL printed as fallback).
- `python -m flowiz` remains an alias of `flowiz`.

### F6 — Web viewer (P1, but headline for README)
Static TypeScript app in `viewer/`, deployed to `georgegach.github.io/flowiz` by CI:
- Drag-drop or file-pick `.flo`, KITTI `.png`, `.pfm`, `.npy`; parsed entirely in the browser (ArrayBuffer + DataView; KITTI PNG via `UPNG.js`-class decoder or Canvas readback with 16-bit handling via `createImageBitmap` fallback — see SDD §4).
- WebGL2 fragment-shader colorization (color wheel as 1D texture) — instant re-render when adjusting `max_flow` slider, saturation, encoding mode.
- Hover inspector: per-pixel u, v, magnitude, angle readout with magnifier.
- Vector overlay toggle (instanced line rendering), adjustable density.
- Multi-file: filmstrip, arrow-key scrubbing, play at chosen fps; "export PNG" and "export WebM" (MediaRecorder) buttons.
- Two-file compare mode: A/B wipe slider + live EPE heatmap (computed in a WebWorker).
- Dark/light theme, responsive, zero network calls after load (works offline; PWA manifest).
- Color-wheel legend always available in a corner widget.

### F7 — Discoverability & citation (P1)
- `pyproject.toml` keywords: optical flow, flow visualization, flo, KITTI, Sintel, RAFT, middlebury, computer vision, motion; full classifier set.
- README rebuilt: hero GIF from the new viewer, quick-start in 3 lines, comparison table vs `flow_vis`/`mmcv`/hand-rolled, badges, "Cite" section with BibTeX.
- `CITATION.cff` (+ instructions in RELEASING.md to mint Zenodo DOI on first v3 release and backfill the DOI badge). Citation is *requested*, not license-enforced (MIT stays).
- MkDocs Material docs site at `/docs`, deployed to Pages alongside the viewer (`/` = viewer, `/docs/` = docs): gallery, API reference (mkdocstrings), format guide, "flowiz for papers" page.
- `examples/`: notebooks — `01_quickstart`, `02_kitti_groundtruth`, `03_raft_output_torch`, `04_error_maps_paper_figure`, `05_video_from_sequence`; Colab badges; small sample data included (existing `demo/flo` retained, plus one KITTI png + one pfm sample).

### F8 — Engineering hygiene (P0)
- `pyproject.toml` (hatchling), `requires-python >= 3.9`, version 3.0.0, single-source version.
- Full type hints, `py.typed` marker; ruff (lint+format); pytest with golden-image regression tests (checked-in reference PNGs, `np.testing` tolerances); >90% coverage on `flowiz/` core.
- GitHub Actions: `ci.yml` (lint, typecheck via pyright, tests on 3.9–3.13, viewer build + vitest), `pages.yml` (viewer + docs deploy), `release.yml` (tag → build → PyPI via trusted publishing). Replaces `flowiz-docker-ci.yml`; Docker image is dropped (viewer needs no server).
- Delete: `flowiz/gui/` (Eel app, committed temp PNGs, mockup), `dist/` from git, `scripts/*.sh`, `Dockerfile`, `MANIFEST.in` cruft. Old demo assets kept only where README/docs still reference them.

## 5. Success metrics
- `pip install flowiz && flowiz convert demo/flo/*.flo` works on a clean machine in <30 s.
- Colorization matches `flow_vis` reference within ±1/255 per channel on Sintel samples.
- 1000-frame 1024×436 sequence → mp4 in <60 s on 8 cores, <2 GB RSS.
- Viewer loads and renders a 4K `.flo` in <1 s after drop; Lighthouse ≥95.
- PyPI page + docs rank for "optical flow visualization python" (leading indicator: complete metadata, docs indexed).

## 6. Compatibility & migration
Hard break (owner-approved). v2 names (`convert_from_file`, `convert_from_flow`, `read_flow`, `convert_files`) are **removed**. Ship `MIGRATION.md` mapping old→new (`read_flow`→`flowiz.read`, `convert_from_flow`→`flowiz.colorize`, `convert_files`→CLI `flowiz convert`). Publish v2.5.0 first? No — go straight to 3.0.0; the README migration table suffices.

---

# Part II — Software Design Document

## 1. Design principles
1. **numpy in, numpy out** — every public function accepts/returns plain `np.ndarray` (HW2 float32) or the thin `Flow` wrapper; torch tensors accepted anywhere via a single `_to_numpy` coercion point.
2. **Pure functions in `flowiz.core`**, side effects (files, video, CLI) at the edges.
3. **Bit-fidelity to the Middlebury reference** — golden tests, not eyeballing.
4. **The viewer duplicates the math in GLSL/TS**; a shared JSON test-vector file keeps Python and TS implementations in lockstep.

## 2. Python package layout

```
flowiz/
  __init__.py        # public API re-exports: read, write, colorize, quiver, epe, ...
  core/
    flow.py          # Flow dataclass
    colorize.py      # color wheel, colorize(), legends, uv/mag/angle encodings
    quiver.py        # vector overlay rendering
    metrics.py       # epe, fl_score, error_map, compare_grid
  io/
    __init__.py      # read()/write() dispatch by magic bytes + extension
    flo.py  kitti.py  pfm.py  npy.py  flo5.py  torch_interop.py
  video.py           # sequence normalization + imageio-ffmpeg streaming writer
  cli/
    app.py           # Typer app; commands: convert, video, info, compare, view
  viewer_assets/     # built static viewer, shipped in wheel (hatch build hook copies from viewer/dist)
  py.typed
viewer/              # TypeScript source (Vite), see §4
docs/                # MkDocs
examples/            # notebooks
tests/               # pytest + golden/
```

### 2.1 `Flow` dataclass
```python
@dataclass(frozen=True)
class Flow:
    data: np.ndarray          # (H, W, 2) float32, u then v
    valid: np.ndarray | None  # (H, W) bool, None = all valid
    source: str | None        # path or "tensor"
    # convenience: .u, .v, .magnitude, .shape; __array__ -> data
```
Every `io` reader returns `Flow`; every core function accepts `Flow | np.ndarray | "torch.Tensor"` through one `as_flow(x)` normalizer (copies input — v2 mutated caller arrays; v3 never does).

### 2.2 Colorization (fix v2 defects)
- Module-level `@lru_cache` color wheel (55×3 float32) — v2 rebuilt it per frame.
- Fully vectorized `_compute_color` (no per-channel Python loop); `k0 = np.floor(fk).astype(np.int32)` — v2's `astype(np.uint8)` silently wraps for ncols>255-safe but fragile; use int32.
- NaN/unknown handling: `|u|>1e9` or NaN → masked, rendered black (v2 left the TODO unimplemented).
- `max_flow=None` → per-frame max (v2 behavior); float → fixed normalization; `video.py` computes sequence max in a first pass (readers are cheap) or accepts `--max-flow`.
- Reference values: vendor `tests/golden/flow_vis_reference.npz` generated once from `flow_vis` to assert parity.

### 2.3 Video pipeline
```python
with VideoWriter(path, fps=24, codec="h264") as w:   # imageio-ffmpeg subprocess, pipe frames
    mx = max(flow_max(f) for f in files)             # pass 1: headers+data max, streamed
    for f in files: w.append(colorize(read(f), max_flow=mx))
```
Never `os.system`; `imageio-ffmpeg` bundles the binary so `apt install ffmpeg` is no longer a requirement. Multiprocessing (`ProcessPoolExecutor`, chunked) for `convert`; video stays single-process but pipelined (read+colorize in a thread ahead of the encoder).

### 2.4 Metrics
- `epe`: `norm(pred-gt, axis=-1)`, masked mean/median/percentiles in an `EpeResult` NamedTuple.
- `fl_score`: outlier = EPE>3 px AND EPE>5% of GT magnitude, over valid px.
- `compare_grid`: matplotlib figure builder (pred, gt, error heatmap using the dataviz-sane `magma` colormap + colorbar, shared title with EPE/Fl stats), `dpi=200` default, returns `Figure` and optionally saves.

### 2.5 CLI
Typer app, Rich progress/tables, `--version`. Errors are human sentences, exit codes: 0 ok, 1 bad input, 2 internal. `flowiz view` starts `http.server` on a free port rooted at `viewer_assets/` and opens the browser.

## 3. Testing strategy
- Unit: each reader against tiny checked-in fixtures (a 8×8 `.flo`, 8×8 KITTI png, pfm, npy — generate fixtures in a script, commit the bytes).
- Golden-image: colorize/quiver/error_map outputs vs committed PNGs, `atol=1`.
- Property: read(write(flow)) round-trips for flo/kitti/npy; random flows.
- Parity: Python vs `tests/vectors.json` (200 random (u,v) → RGB triples) — same file consumed by vitest in the viewer.
- CLI: `typer.testing.CliRunner` end-to-end on demo files.

## 4. Web viewer design

**Stack:** Vite + TypeScript + WebGL2, no framework (or Preact if state gets hairy — implementer's call; keep bundle <300 KB gzip). Deployed by `pages.yml`; also copied into the wheel by a build hook (CI builds viewer before `hatch build`).

**Parsing (all in-browser, WebWorker):**
- `.flo`: DataView — tag 202021.25, w, h, interleaved float32.
- `.pfm`: ASCII header + big/little endian float parsing.
- `.npy`: minimal npy parser (v1/v2 header, float32/float64, HW2 or 2HW).
- KITTI `.png`: decode via `fetch→ImageDecoder` where available, else bundled minimal PNG inflate (pako) reading raw 16-bit samples; `flow = (val-2^15)/64`, `valid = ch3>0`.

**Rendering:** upload u,v as RG32F texture; fragment shader implements the color wheel via a 55×1 RGBA LUT texture + linear interp identical to Python's lerp; uniforms: `maxFlow`, `mode` (rgb/uv/mag/angle), `saturation`, `maskInvalid`. Vector overlay: instanced GL_LINES on a stride grid, scaled by flow, drawn over the image. Zoom/pan via canvas transform; magnifier renders a 9×9 patch readback with numeric u,v.

**Compare mode:** two textures, wipe uniform; EPE computed in worker → magma-LUT heatmap texture; summary stats in the toolbar.

**Export:** PNG via `canvas.toBlob`; WebM via `MediaRecorder` capture of playback.

**Parity guardrail:** `viewer/src/colorwheel.test.ts` consumes the same `tests/vectors.json` as pytest.

## 5. CI/CD

| Workflow | Trigger | Jobs |
|---|---|---|
| `ci.yml` | push/PR | ruff, pyright, pytest (3.9–3.13 matrix), viewer typecheck+vitest+build |
| `pages.yml` | push master | build viewer → `/`, mkdocs → `/docs/`, deploy Pages |
| `release.yml` | tag `v*` | build sdist+wheel (with viewer assets), PyPI trusted publishing, GitHub Release with notes |

Delete `flowiz-docker-ci.yml`, `Dockerfile`, DockerHub references.

## 6. Implementation plan (ordered, each step leaves the repo green)

1. **Scaffold**: pyproject.toml, ruff, pytest, CI skeleton; move v2 code under `flowiz/` unchanged; delete gui/, dist/, scripts/, Dockerfile.
2. **Core rewrite**: `Flow`, `io/flo.py`, `core/colorize.py` (vectorized, cached, masked) + golden/parity tests.
3. **Formats**: kitti, pfm, npy, torch interop, flo5 (guarded import), write-side.
4. **Metrics** + `compare_grid`.
5. **Video** module (imageio-ffmpeg) + sequence normalization.
6. **CLI** (Typer) incl. `flowiz view` stub.
7. **Viewer**: parse+render `.flo` → all formats → inspector/vectors → compare → export; wire parity vectors.
8. **Docs + examples + README + CITATION.cff**, MIGRATION.md.
9. **Release engineering**: pages.yml, release.yml, wheel-bundled viewer, tag v3.0.0. Zenodo DOI minted manually post-release per RELEASING.md.

## 7. Risks
- **16-bit PNG decode in browser** varies by engine → always fall back to bundled pako-based decoder; test with a KITTI fixture in vitest.
- **flow_vis parity** on the `radius>1` desaturation branch differs subtly between implementations → the golden `.npz` is the arbiter; document any deliberate deviation.
- **Wheel size** with bundled viewer + matplotlib dep: keep viewer dist <1.5 MB; acceptable.
- **PyPI downloads regression** from hard break → MIGRATION.md + clear 3.0.0 changelog; v2.4.x remains installable.
