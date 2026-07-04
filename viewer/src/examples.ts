/** Shipped examples: synthetic flow fields (zero-download) + bundled real flows. */

import type { FlowField } from "./flow";
import { parseFlo } from "./flow";

export interface ExampleDef {
  id: string;
  label: string;
  /** Loader returns one or more frames. */
  load: () => Promise<FlowField[]>;
}

function synth(
  name: string,
  w: number,
  h: number,
  fn: (x: number, y: number, cx: number, cy: number) => [number, number],
): FlowField {
  const data = new Float32Array(w * h * 2);
  const cx = w / 2;
  const cy = h / 2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [u, v] = fn(x, y, cx, cy);
      const i = (y * w + x) * 2;
      data[i] = u;
      data[i + 1] = v;
    }
  }
  return { width: w, height: h, data, name };
}

const W = 480;
const H = 320;

async function fetchFlo(url: string, name: string): Promise<FlowField> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load ${name}`);
  return parseFlo(await res.arrayBuffer(), name);
}

export const EXAMPLES: ExampleDef[] = [
  {
    id: "sequence",
    label: "Real sequence",
    load: async () => [
      await fetchFlo(`${import.meta.env.BASE_URL}samples/frame_0001.flo`, "frame_0001.flo"),
      await fetchFlo(`${import.meta.env.BASE_URL}samples/frame_0002.flo`, "frame_0002.flo"),
    ],
  },
  {
    id: "rotation",
    label: "Rotation",
    load: async () => [
      synth("rotation.synthetic", W, H, (x, y, cx, cy) => [
        -(y - cy) / 12,
        (x - cx) / 12,
      ]),
    ],
  },
  {
    id: "zoom",
    label: "Zoom / radial",
    load: async () => [
      synth("zoom.synthetic", W, H, (x, y, cx, cy) => [(x - cx) / 10, (y - cy) / 10]),
    ],
  },
  {
    id: "wave",
    label: "Wave",
    load: async () => [
      synth("wave.synthetic", W, H, (x, y) => [
        20 * Math.sin((y / H) * Math.PI * 2),
        20 * Math.cos((x / W) * Math.PI * 2),
      ]),
    ],
  },
];
