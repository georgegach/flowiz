/**
 * ffmpeg.wasm frame source. Normalises ANY input the browser's own <video>
 * decoder would choke on — 4K, HEVC/H.265, .mov/.mkv/.avi, odd pixel formats —
 * by running single-threaded ffmpeg.wasm to downscale to the target resolution
 * and extract exact, strided frames as PNGs. Gives real per-frame decode
 * progress (ffmpeg's own `progress`/`frame=` reporting), which the plain
 * <video> seek decoder can't.
 *
 * Single-threaded core only: the multithread core needs SharedArrayBuffer and
 * therefore COOP/COEP headers, which GitHub Pages cannot set. Slower, but it
 * runs everywhere. Assets are served same-origin from vendor/ffmpeg/ and loaded
 * via ABSOLUTE URLs so Vite's relative `base: "./"` never double-resolves the
 * worker/core paths.
 */

import { FFmpeg } from "@ffmpeg/ffmpeg";
import type { VideoFrameSource, FrameSourceOptions, RGBAFrameData } from "./decode";
import type { ProgressFn } from "../flowgen/types";
import { cachedFetch } from "../flowgen/asset-cache";

/** Read a PNG's pixel dimensions straight from its IHDR chunk (no decode). */
function pngSize(u8: Uint8Array): { w: number; h: number } {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  return { w: dv.getUint32(16), h: dv.getUint32(20) };
}

function parseFps(log: string): number | null {
  const m = log.match(/,\s*([\d.]+)\s*fps\b/);
  const v = m ? parseFloat(m[1]) : NaN;
  return Number.isFinite(v) && v > 0 ? v : null;
}

function parseDurationSec(log: string): number | null {
  const m = log.match(/Duration:\s*(\d+):(\d+):([\d.]+)/);
  if (!m) return null;
  return (+m[1]) * 3600 + (+m[2]) * 60 + parseFloat(m[3]);
}

export async function openVideoFFmpeg(
  file: File,
  opts: FrameSourceOptions,
  onProgress: ProgressFn,
  baseUrl: string,
): Promise<VideoFrameSource> {
  const stride = Math.max(1, Math.floor(opts.stride));
  const maxDim = Math.max(2, Math.floor(opts.maxDim));

  // Fetch the ~32 MB wasm ourselves (through the asset cache, so a second run
  // skips the download) and hand it to the core as a blob URL — emscripten's
  // locateFile picks it up via wasmURL. Serving cached bytes here also fixes the
  // fresh-blob-URL-per-run that used to defeat the browser's HTTP cache.
  const { buffer: wasmBuf } = await cachedFetch(
    `${baseUrl}vendor/ffmpeg/core/ffmpeg-core.wasm`,
    (loaded, total, fromCache) =>
      onProgress(
        fromCache ? "Loading video engine (cached)" : "Downloading video engine (ffmpeg)",
        loaded,
        total,
        "bytes",
      ),
  );
  const wasmURL = URL.createObjectURL(new Blob([wasmBuf], { type: "application/wasm" }));

  const ffmpeg = new FFmpeg();
  let fps: number | null = null;
  let durationSec: number | null = null;
  let lastFrame = 0;

  const revoke = () => URL.revokeObjectURL(wasmURL);

  ffmpeg.on("log", ({ message }) => {
    if (fps == null) fps = parseFps(message);
    if (durationSec == null) durationSec = parseDurationSec(message);
    const fm = message.match(/frame=\s*(\d+)/);
    if (fm) lastFrame = parseInt(fm[1], 10);
  });

  onProgress("Starting video engine", 0, 0, "indeterminate");
  try {
    await ffmpeg.load({
      classWorkerURL: `${baseUrl}vendor/ffmpeg/pkg/worker.js`,
      coreURL: `${baseUrl}vendor/ffmpeg/core/ffmpeg-core.js`,
      wasmURL,
    });
  } catch (e) {
    revoke();
    throw new Error(`Could not start the video engine (ffmpeg): ${(e as Error)?.message || e}`);
  }
  // Wasm is compiled + instantiated now; free the ~32 MB blob so a long decode
  // doesn't pin it. (close() also revokes — revokeObjectURL is idempotent.)
  revoke();

  // Decode progress: ffmpeg's `progress` ratio drives the bar; `frame=` from the
  // logs gives the live frame count in the label.
  ffmpeg.on("progress", ({ progress }) => {
    const est =
      durationSec && fps ? Math.max(1, Math.floor((durationSec * fps) / stride)) : 0;
    const ratio = Math.max(0, Math.min(1, progress || 0));
    const label = est
      ? `Decoding & downscaling video — frame ${lastFrame} / ~${est}`
      : `Decoding & downscaling video — frame ${lastFrame}`;
    onProgress(label, Math.round(ratio * 1000), 1000, "count");
  });

  const ext = (file.name.match(/\.[a-z0-9]+$/i)?.[0] || ".bin").toLowerCase();
  const inName = `input${ext}`;
  await ffmpeg.writeFile(inName, new Uint8Array(await file.arrayBuffer()));

  // scaleFactor = min(1, maxDim/longerSide) → never upscales; even dimensions.
  const sf = `min(1\\,${maxDim}/max(iw\\,ih))`;
  const vf =
    `scale=w=trunc(iw*${sf}/2)*2:h=trunc(ih*${sf}/2)*2,` +
    `select=not(mod(n\\,${stride}))`;

  onProgress("Decoding & downscaling video", 0, 1000, "count");
  const code = await ffmpeg.exec([
    "-i", inName,
    "-vf", vf,
    "-vsync", "0",
    "-an",
    "frame_%04d.png",
  ]);
  if (code !== 0) {
    ffmpeg.terminate();
    revoke();
    throw new Error("ffmpeg could not decode this video.");
  }

  const entries = await ffmpeg.listDir("/");
  const names = entries
    .filter((e) => !e.isDir && /^frame_\d+\.png$/.test(e.name))
    .map((e) => e.name)
    .sort();
  if (!names.length) {
    ffmpeg.terminate();
    revoke();
    throw new Error("ffmpeg produced no frames from this video.");
  }
  await ffmpeg.deleteFile(inName).catch(() => {});

  // Peek the first frame's dimensions without a full decode.
  const first = (await ffmpeg.readFile(names[0])) as Uint8Array;
  const { w: outW, h: outH } = pngSize(first);
  const effFps = fps ?? 30;

  onProgress("Reading frames", 0, names.length, "count");

  async function* frames(): AsyncGenerator<RGBAFrameData> {
    const canvas = document.createElement("canvas");
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    for (let idx = 0; idx < names.length; idx++) {
      const name = names[idx];
      const data = (await ffmpeg.readFile(name)) as Uint8Array;
      const bmp = await createImageBitmap(new Blob([data], { type: "image/png" }));
      ctx.drawImage(bmp, 0, 0, outW, outH);
      bmp.close();
      await ffmpeg.deleteFile(name).catch(() => {});
      const img = ctx.getImageData(0, 0, outW, outH);
      yield {
        width: outW,
        height: outH,
        data: img.data.buffer.slice(0),
        timestampUs: Math.round(((idx * stride) / effFps) * 1e6),
      };
    }
  }

  return {
    frameCount: names.length,
    fps: effFps,
    srcWidth: outW,
    srcHeight: outH,
    frames,
    close() {
      ffmpeg.terminate();
      revoke();
    },
  };
}
