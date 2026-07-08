/**
 * Frame source for a dropped video. Uses a hidden <video> element seeked frame
 * by frame and drawn to a canvas — works in every browser that can play the
 * container, needs no demuxer, and is fully type-safe. Frames are downscaled to
 * `maxDim` and subsampled by `stride` at the source of truth so the flow engine
 * never sees full-resolution data.
 */

export interface FrameSourceOptions {
  stride: number;
  maxDim: number;
  maxFrames?: number;
}

export interface RGBAFrameData {
  width: number;
  height: number;
  data: ArrayBuffer; // RGBA8
  timestampUs: number;
}

export interface VideoFrameSource {
  readonly frameCount: number;
  readonly fps: number;
  readonly srcWidth: number;
  readonly srcHeight: number;
  frames(): AsyncGenerator<RGBAFrameData>;
  close(): void;
}

const ASSUMED_FPS = 30;

/** Longest we'll wait for a single seek before giving up on that frame — a
 *  non-decodable seek point otherwise never emits `seeked` and hangs forever. */
const SEEK_TIMEOUT_MS = 4000;

export async function openVideo(
  file: File,
  opts: FrameSourceOptions,
  signal?: AbortSignal,
): Promise<VideoFrameSource> {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = url;

  const cleanup = () => {
    URL.revokeObjectURL(url);
    video.removeAttribute("src");
    video.load();
  };

  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("Could not decode this video."));
    });
  } catch (e) {
    cleanup(); // don't leak the blob URL / File-pinning <video> on decode failure
    throw e;
  }

  const srcWidth = video.videoWidth;
  const srcHeight = video.videoHeight;
  const duration = video.duration;
  // The DOM gives no frame count; estimate from duration at an assumed fps.
  const fps = ASSUMED_FPS;
  const totalRaw = Math.max(1, Math.floor(duration * fps));
  const stride = Math.max(1, Math.floor(opts.stride));
  let count = Math.floor(totalRaw / stride);
  if (opts.maxFrames) count = Math.min(count, opts.maxFrames);

  const scale = Math.min(1, opts.maxDim / Math.max(srcWidth, srcHeight));
  const outW = Math.max(2, Math.round(srcWidth * scale));
  const outH = Math.max(2, Math.round(srcHeight * scale));

  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;

  const seekTo = (t: number) =>
    new Promise<void>((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        video.removeEventListener("seeked", onSeeked);
        resolve();
      };
      const onSeeked = () => {
        // Give the decoder a beat to paint the frame before we read it.
        const rvfc = (video as unknown as {
          requestVideoFrameCallback?: (cb: () => void) => number;
        }).requestVideoFrameCallback;
        if (rvfc) rvfc.call(video, finish);
        else requestAnimationFrame(finish);
      };
      // A stalled/non-decodable seek never fires `seeked`; fall through after a
      // timeout with whatever frame is currently painted rather than hanging.
      const timer = setTimeout(finish, SEEK_TIMEOUT_MS);
      video.addEventListener("seeked", onSeeked);
      video.currentTime = t;
    });

  async function* frames(): AsyncGenerator<RGBAFrameData> {
    for (let i = 0; i < count; i++) {
      if (signal?.aborted) return;
      const t = Math.min(duration - 1e-3, (i * stride) / fps);
      await seekTo(t);
      ctx.drawImage(video, 0, 0, outW, outH);
      const img = ctx.getImageData(0, 0, outW, outH);
      // Copy out of the ImageData's buffer so it can be transferred.
      const buf = img.data.buffer.slice(0);
      yield { width: outW, height: outH, data: buf, timestampUs: Math.round(t * 1e6) };
    }
  }

  return {
    frameCount: count,
    fps,
    srcWidth: outW,
    srcHeight: outH,
    frames,
    close: cleanup,
  };
}
