import { describe, it, expect } from "vitest";
import { encodeFlo, encodeKittiPng, encodePfm, encodeNpy } from "./writers";
import { parseFlo, parsePfm, parseNpy, parseKittiPng, type FlowField } from "../flow";

// Non-square field everywhere to catch row-flip / transpose bugs.
function makeField(): FlowField {
  const width = 5;
  const height = 3;
  const data = new Float32Array(width * height * 2);
  for (let i = 0; i < data.length; i++) data[i] = (i - data.length / 2) * 0.5;
  return { width, height, data, name: "t.flo" };
}

function makeFieldWithValid(): FlowField {
  const f = makeField();
  const valid = new Uint8Array(f.width * f.height).fill(1);
  valid[0] = 0; // one invalid pixel
  valid[7] = 0;
  return { ...f, valid };
}

describe("encodeFlo", () => {
  it("round-trips exactly", () => {
    const f = makeField();
    const g = parseFlo(encodeFlo(f).buffer as ArrayBuffer, "x.flo");
    expect(g.width).toBe(f.width);
    expect(g.height).toBe(f.height);
    expect(Array.from(g.data)).toEqual(Array.from(f.data));
  });
});

describe("encodePfm", () => {
  it("round-trips exactly with validity", () => {
    const f = makeFieldWithValid();
    const g = parsePfm(encodePfm(f).buffer as ArrayBuffer, "x.pfm");
    expect(g.width).toBe(f.width);
    expect(g.height).toBe(f.height);
    expect(Array.from(g.data)).toEqual(Array.from(f.data));
    expect(Array.from(g.valid!)).toEqual(Array.from(f.valid!));
  });
});

describe("encodeNpy", () => {
  it("round-trips exactly and aligns header to 64 bytes", () => {
    const f = makeField();
    const bytes = encodeNpy(f);
    const headerLen = new DataView(bytes.buffer).getUint16(8, true);
    expect((10 + headerLen) % 64).toBe(0);
    const g = parseNpy(bytes.buffer as ArrayBuffer, "x.npy");
    expect(Array.from(g.data)).toEqual(Array.from(f.data));
  });
});

describe("encodeKittiPng", () => {
  it("round-trips within 1/64 quantization and preserves validity", () => {
    const f = makeFieldWithValid();
    const g = parseKittiPng(encodeKittiPng(f).buffer as ArrayBuffer, "x.png");
    expect(g.width).toBe(f.width);
    expect(g.height).toBe(f.height);
    expect(Array.from(g.valid!)).toEqual(Array.from(f.valid!));
    for (let i = 0; i < f.width * f.height; i++) {
      if (!f.valid![i]) {
        expect(g.data[i * 2]).toBe(0);
        expect(g.data[i * 2 + 1]).toBe(0);
      } else {
        expect(Math.abs(g.data[i * 2] - f.data[i * 2])).toBeLessThanOrEqual(1 / 64);
        expect(Math.abs(g.data[i * 2 + 1] - f.data[i * 2 + 1])).toBeLessThanOrEqual(1 / 64);
      }
    }
  });
});
