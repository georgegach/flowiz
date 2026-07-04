/**
 * The Baker/Middlebury color wheel — the exact same math as flowiz's Python
 * `flowiz.core.colorize`, so browser and library output match bit-for-bit.
 * Used both as the WebGL LUT source and as a CPU reference in tests.
 */

let _cached: Uint8Array | null = null;

export function makeColorwheel(): Uint8Array {
  if (_cached) return _cached;
  const RY = 15,
    YG = 6,
    GC = 4,
    CB = 11,
    BM = 13,
    MR = 6;
  const ncols = RY + YG + GC + CB + BM + MR; // 55
  const wheel = new Float64Array(ncols * 3);
  const set = (row: number, ch: number, val: number) => {
    wheel[row * 3 + ch] = val;
  };
  let col = 0;
  for (let i = 0; i < RY; i++) {
    set(i, 0, 255);
    set(i, 1, Math.floor((255 * i) / RY));
  }
  col += RY;
  for (let i = 0; i < YG; i++) {
    set(col + i, 0, 255 - Math.floor((255 * i) / YG));
    set(col + i, 1, 255);
  }
  col += YG;
  for (let i = 0; i < GC; i++) {
    set(col + i, 1, 255);
    set(col + i, 2, Math.floor((255 * i) / GC));
  }
  col += GC;
  for (let i = 0; i < CB; i++) {
    set(col + i, 1, 255 - Math.floor((255 * i) / CB));
    set(col + i, 2, 255);
  }
  col += CB;
  for (let i = 0; i < BM; i++) {
    set(col + i, 2, 255);
    set(col + i, 0, Math.floor((255 * i) / BM));
  }
  col += BM;
  for (let i = 0; i < MR; i++) {
    set(col + i, 2, 255 - Math.floor((255 * i) / MR));
    set(col + i, 0, 255);
  }
  const out = new Uint8Array(ncols * 3);
  for (let i = 0; i < out.length; i++) out[i] = wheel[i];
  _cached = out;
  return out;
}

export const NCOLS = 55;

/** Map a single normalized (u, v) to an [r,g,b] triple — CPU reference. */
export function uvToColor(u: number, v: number): [number, number, number] {
  const wheel = makeColorwheel();
  const rad = Math.hypot(u, v);
  const a = Math.atan2(-v, -u) / Math.PI;
  const fk = ((a + 1) / 2) * (NCOLS - 1);
  const k0 = Math.floor(fk);
  let k1 = k0 + 1;
  if (k1 === NCOLS) k1 = 0;
  const f = fk - k0;
  const rgb: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    const col0 = wheel[k0 * 3 + i] / 255;
    const col1 = wheel[k1 * 3 + i] / 255;
    let col = (1 - f) * col0 + f * col1;
    if (rad <= 1) col = 1 - rad * (1 - col);
    else col = col * 0.75;
    rgb[i] = Math.floor(255 * col);
  }
  return rgb;
}
