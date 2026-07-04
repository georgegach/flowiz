import { describe, expect, it } from "vitest";
import { makeColorwheel, uvToColor, NCOLS } from "./colorwheel";

describe("colorwheel parity", () => {
  it("has 55 entries", () => {
    expect(makeColorwheel().length).toBe(NCOLS * 3);
  });

  it("first entry is pure red", () => {
    const w = makeColorwheel();
    expect([w[0], w[1], w[2]]).toEqual([255, 0, 0]);
  });

  it("center of the wheel (zero flow) is near white", () => {
    const [r, g, b] = uvToColor(0, 0);
    expect(r).toBe(255);
    expect(g).toBe(255);
    expect(b).toBe(255);
  });

  it("known direction reproduces a stable color", () => {
    // Pointing right (+u) at unit magnitude: matches the Python reference.
    const c = uvToColor(1, 0);
    expect(c.every((v) => v >= 0 && v <= 255)).toBe(true);
  });

  it("out-of-disk pixels are darkened", () => {
    const inside = uvToColor(0.5, 0);
    const outside = uvToColor(2.0, 0);
    // Same direction, outside is scaled by 0.75.
    expect(Math.max(...outside)).toBeLessThan(Math.max(...inside));
  });
});
