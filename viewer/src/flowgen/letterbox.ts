/**
 * Aspect-preserving letterbox math for fixed-shape models (RAFT wants 360×480).
 * Pure and unit-tested. `unletterboxFlow` crops padding, resizes both flow
 * channels back to source size, and rescales the vectors by the resize factor.
 */

export interface LetterboxPlan {
  scale: number; // src -> dst scale factor applied when fitting
  padX: number; // left/right padding in dst pixels (per side)
  padY: number; // top/bottom padding in dst pixels (per side)
  drawW: number; // width of the drawn (unpadded) region in dst pixels
  drawH: number; // height of the drawn region in dst pixels
}

export function planLetterbox(
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
): LetterboxPlan {
  const scale = Math.min(dstW / srcW, dstH / srcH);
  const drawW = Math.round(srcW * scale);
  const drawH = Math.round(srcH * scale);
  return {
    scale,
    padX: Math.floor((dstW - drawW) / 2),
    padY: Math.floor((dstH - drawH) / 2),
    drawW,
    drawH,
  };
}

/**
 * `flow` is the model output at dst resolution (interleaved u,v, length dstW*dstH*2).
 * Returns flow at source resolution with vectors rescaled to source pixel units.
 */
export function unletterboxFlow(
  flow: Float32Array,
  plan: LetterboxPlan,
  dstW: number,
  srcW: number,
  srcH: number,
): Float32Array {
  const { padX, padY, drawW, drawH } = plan;
  const out = new Float32Array(srcW * srcH * 2);
  const uScale = srcW / drawW;
  const vScale = srcH / drawH;
  for (let y = 0; y < srcH; y++) {
    // map source row -> position within the drawn region (bilinear)
    const fy = (y / srcH) * drawH + padY;
    const y0 = Math.min(Math.floor(fy), padY + drawH - 1);
    const y1 = Math.min(y0 + 1, padY + drawH - 1);
    const wy = fy - Math.floor(fy);
    for (let x = 0; x < srcW; x++) {
      const fx = (x / srcW) * drawW + padX;
      const x0 = Math.min(Math.floor(fx), padX + drawW - 1);
      const x1 = Math.min(x0 + 1, padX + drawW - 1);
      const wx = fx - Math.floor(fx);
      const oi = (y * srcW + x) * 2;
      for (let c = 0; c < 2; c++) {
        const a = flow[(y0 * dstW + x0) * 2 + c];
        const b = flow[(y0 * dstW + x1) * 2 + c];
        const d = flow[(y1 * dstW + x0) * 2 + c];
        const e = flow[(y1 * dstW + x1) * 2 + c];
        const top = a + (b - a) * wx;
        const bot = d + (e - d) * wx;
        out[oi + c] = (top + (bot - top) * wy) * (c === 0 ? uScale : vScale);
      }
    }
  }
  return out;
}
