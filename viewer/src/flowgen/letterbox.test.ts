import { describe, it, expect } from "vitest";
import { planLetterbox, unletterboxFlow } from "./letterbox";

describe("planLetterbox", () => {
  it("has no padding when aspect ratios match", () => {
    const p = planLetterbox(240, 180, 480, 360);
    expect(p.padX).toBe(0);
    expect(p.padY).toBe(0);
    expect(p.drawW).toBe(480);
    expect(p.drawH).toBe(360);
  });

  it("pads horizontally for a wide source into a 4:3 box", () => {
    const p = planLetterbox(1920, 1080, 480, 360);
    // fit by width: scale 0.25 -> 480x270, vertical padding (360-270)/2 = 45
    expect(p.drawW).toBe(480);
    expect(p.drawH).toBe(270);
    expect(p.padX).toBe(0);
    expect(p.padY).toBe(45);
  });
});

describe("unletterboxFlow", () => {
  it("rescales a uniform flow field by the resize factor", () => {
    // src 240x180 -> dst 480x360 (scale 2, no pad). A uniform u=1 at dst
    // corresponds to u = srcW/drawW = 0.5 at source.
    const dstW = 480;
    const dstH = 360;
    const flow = new Float32Array(dstW * dstH * 2);
    for (let i = 0; i < flow.length; i += 2) {
      flow[i] = 1; // u
      flow[i + 1] = 2; // v
    }
    const plan = planLetterbox(240, 180, dstW, dstH);
    const out = unletterboxFlow(flow, plan, dstW, 240, 180);
    expect(out.length).toBe(240 * 180 * 2);
    // uScale = 240/480 = 0.5, vScale = 180/360 = 0.5
    expect(out[0]).toBeCloseTo(0.5, 5);
    expect(out[1]).toBeCloseTo(1.0, 5);
    const mid = (90 * 240 + 120) * 2;
    expect(out[mid]).toBeCloseTo(0.5, 5);
    expect(out[mid + 1]).toBeCloseTo(1.0, 5);
  });
});
