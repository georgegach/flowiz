/** Animated GIF via gifenc, one global palette (built from the first frame) to avoid flicker. */

import { GIFEncoder, quantize, applyPalette } from "gifenc";
import type { SerializedFlow } from "../flowgen/types";
import { colorizeFlow } from "./colorize";
import type { FlowField } from "../flow";

// NOTE: keep in sync with GIF_MAX_WIDTH / GIF_MAX_FRAMES in ui/export-menu.ts,
// which warns the user upfront when a sequence will be capped here.
const MAX_WIDTH = 480;
const MAX_FRAMES = 300;

function toFlowField(s: SerializedFlow): FlowField {
  return {
    width: s.width,
    height: s.height,
    data: new Float32Array(s.data),
    valid: s.valid ? new Uint8Array(s.valid) : undefined,
    name: s.name,
  };
}

export function encodeGif(
  frames: SerializedFlow[],
  fps: number,
  sharedMax: number,
  onProgress?: (done: number, total: number) => void,
): Uint8Array {
  const capped = frames.slice(0, MAX_FRAMES);
  const sw = capped[0].width;
  const sh = capped[0].height;
  // Cap GIF width — a full-res sequence balloons to hundreds of MB and can OOM
  // the tab. This is what GIF_MAX_WIDTH was always meant to do.
  const scale = sw > MAX_WIDTH ? MAX_WIDTH / sw : 1;
  const w = Math.max(1, Math.round(sw * scale));
  const h = Math.max(1, Math.round(sh * scale));
  const delay = Math.round(1000 / fps);
  const gif = GIFEncoder();

  // Downscale via OffscreenCanvas only when needed (available in the worker).
  const src = scale < 1 ? new OffscreenCanvas(sw, sh) : null;
  const sctx = src?.getContext("2d") ?? null;
  const dst = scale < 1 ? new OffscreenCanvas(w, h) : null;
  const dctx = dst?.getContext("2d") ?? null;

  let palette: number[][] | null = null;
  for (let i = 0; i < capped.length; i++) {
    const rgba = colorizeFlow(toFlowField(capped[i]), sharedMax);
    let bytes: Uint8Array;
    if (sctx && dctx && src) {
      sctx.putImageData(new ImageData(rgba, sw, sh), 0, 0);
      dctx.drawImage(src, 0, 0, w, h);
      bytes = new Uint8Array(dctx.getImageData(0, 0, w, h).data.buffer);
    } else {
      bytes = new Uint8Array(rgba.buffer);
    }
    if (!palette) palette = quantize(bytes, 256);
    const index = applyPalette(bytes, palette);
    gif.writeFrame(index, w, h, { palette, delay });
    onProgress?.(i + 1, capped.length);
  }
  gif.finish();
  return gif.bytes(); // exact-length copy — safe to transfer its buffer
}
