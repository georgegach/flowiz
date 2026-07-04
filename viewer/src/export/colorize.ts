/**
 * CPU colorization of a FlowField to RGBA, using the shared Middlebury wheel
 * (colorwheel.uvToColor — no DOM deps, safe in a worker). Deterministic and
 * testable, unlike a GPU readback. `maxFlow` normalizes magnitude across a
 * whole sequence so exported animations don't flicker.
 */

import type { FlowField } from "../flow";
import { uvToColor } from "../colorwheel";

export function colorizeFlow(f: FlowField, maxFlow: number): Uint8ClampedArray {
  const n = f.width * f.height;
  const out = new Uint8ClampedArray(n * 4);
  const norm = maxFlow > 0 ? maxFlow : 1;
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    if (f.valid && !f.valid[i]) {
      out[o] = out[o + 1] = out[o + 2] = 0;
      out[o + 3] = 255;
      continue;
    }
    const [r, g, b] = uvToColor(f.data[i * 2] / norm, f.data[i * 2 + 1] / norm);
    out[o] = r;
    out[o + 1] = g;
    out[o + 2] = b;
    out[o + 3] = 255;
  }
  return out;
}

/** Max flow magnitude across an entire sequence — the shared normalizer. */
export function sequenceMaxFlow(frames: FlowField[]): number {
  let mx = 0;
  for (const f of frames) {
    for (let i = 0; i < f.data.length; i += 2) {
      const u = f.data[i];
      const v = f.data[i + 1];
      if (!isFinite(u) || !isFinite(v)) continue;
      if (f.valid && !f.valid[i >> 1]) continue;
      const m = Math.hypot(u, v);
      if (m > mx) mx = m;
    }
  }
  return mx;
}
