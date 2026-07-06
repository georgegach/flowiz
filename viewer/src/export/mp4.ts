/** MP4 animation via WebCodecs VideoEncoder + mp4-muxer. Runs in the worker. */

import { Muxer, ArrayBufferTarget } from "mp4-muxer";
import type { SerializedFlow } from "../flowgen/types";
import { colorizeFlow } from "./colorize";
import type { FlowField } from "../flow";

function toFlowField(s: SerializedFlow): FlowField {
  return {
    width: s.width,
    height: s.height,
    data: new Float32Array(s.data),
    valid: s.valid ? new Uint8Array(s.valid) : undefined,
    name: s.name,
  };
}

/** Map a WebCodecs codec string to mp4-muxer's short codec id. */
function muxerCodec(codec: string): "avc" | "vp9" | "av1" | "hevc" {
  if (codec.startsWith("avc1") || codec.startsWith("avc3")) return "avc";
  if (codec.startsWith("vp09") || codec === "vp9") return "vp9";
  if (codec.startsWith("av01")) return "av1";
  if (codec.startsWith("hvc1") || codec.startsWith("hev1")) return "hevc";
  return "avc";
}

export async function encodeMp4(
  frames: SerializedFlow[],
  fps: number,
  sharedMax: number,
  codec: string,
  onProgress?: (done: number, total: number) => void,
): Promise<Uint8Array> {
  // WebCodecs globals aren't reliably in lib.dom across TS versions — access untyped.
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const VideoEncoderCtor = (globalThis as any).VideoEncoder;
  const VideoFrameCtor = (globalThis as any).VideoFrame;
  if (!VideoEncoderCtor || !VideoFrameCtor) {
    throw new Error("This browser has no WebCodecs video encoder — try GIF or ZIP instead.");
  }

  // H.264 (and most encoders) require even dimensions — pad up by 1px if odd.
  const w = frames[0].width + (frames[0].width % 2);
  const h = frames[0].height + (frames[0].height % 2);

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: muxerCodec(codec), width: w, height: h },
    fastStart: "in-memory",
  });

  // The encoder reports async failures via this callback, NOT by throwing where
  // we can catch it — capture the first error and surface it after flush().
  let encoderError: Error | null = null;
  const encoder = new VideoEncoderCtor({
    output: (chunk: any, meta: any) => muxer.addVideoChunk(chunk, meta),
    error: (e: any) => {
      encoderError ??= e instanceof Error ? e : new Error(e?.message || "Video encoding failed");
    },
  });
  const bitrate = Math.min(8_000_000, Math.round(w * h * fps * 0.15));
  encoder.configure({ codec, width: w, height: h, bitrate, framerate: fps });

  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext("2d")!;
  const frameDurUs = Math.round(1e6 / fps);

  for (let i = 0; i < frames.length; i++) {
    if (encoderError) throw encoderError; // stop early on a codec failure
    const s = frames[i];
    const rgba = colorizeFlow(toFlowField(s), sharedMax);
    ctx.fillStyle = "black";
    ctx.fillRect(0, 0, w, h);
    ctx.putImageData(new ImageData(rgba, s.width, s.height), 0, 0);
    const vf = new VideoFrameCtor(canvas, { timestamp: i * frameDurUs, duration: frameDurUs });
    encoder.encode(vf, { keyFrame: i % 30 === 0 });
    vf.close();
    onProgress?.(i + 1, frames.length);
  }

  await encoder.flush();
  encoder.close();
  if (encoderError) throw encoderError;
  muxer.finalize();
  return new Uint8Array((muxer.target as ArrayBufferTarget).buffer);
}
