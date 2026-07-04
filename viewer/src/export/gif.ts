/** Animated GIF via gifenc, one global palette (built from the first frame) to avoid flicker. */

import { GIFEncoder, quantize, applyPalette } from "gifenc";
import type { SerializedFlow } from "../flowgen/types";
import { colorizeFlow } from "./colorize";
import type { FlowField } from "../flow";

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

export function encodeGif(frames: SerializedFlow[], fps: number, sharedMax: number): Uint8Array {
  const capped = frames.slice(0, MAX_FRAMES);
  const w = capped[0].width;
  const h = capped[0].height;
  const delay = Math.round(1000 / fps);
  const gif = GIFEncoder();

  let palette: number[][] | null = null;
  for (const s of capped) {
    const rgba = colorizeFlow(toFlowField(s), sharedMax);
    const bytes = new Uint8Array(rgba.buffer);
    if (!palette) palette = quantize(bytes, 256);
    const index = applyPalette(bytes, palette);
    gif.writeFrame(index, w, h, { palette, delay });
  }
  gif.finish();
  return gif.bytes(); // exact-length copy — safe to transfer its buffer
}

export { MAX_WIDTH as GIF_MAX_WIDTH, MAX_FRAMES as GIF_MAX_FRAMES };
