import { describe, expect, it } from "vitest";
import { parseFlo, parseNpy } from "./flow";

const FLO_TAG = 202021.25;

function makeFlo(width: number, height: number, count = width * height * 2): ArrayBuffer {
  const buf = new ArrayBuffer(12 + count * 4);
  const dv = new DataView(buf);
  dv.setFloat32(0, FLO_TAG, true);
  dv.setInt32(4, width, true);
  dv.setInt32(8, height, true);
  for (let i = 0; i < count; i++) dv.setFloat32(12 + i * 4, i, true);
  return buf;
}

/** Build a minimal .npy v1.0 buffer with the given header dict + f4 body. */
function makeNpy(headerDict: string, values: number[]): ArrayBuffer {
  const enc = new TextEncoder();
  let header = headerDict;
  // pad so 10 + header length is a multiple of 64, header ends with \n
  const pad = (64 - ((10 + header.length + 1) % 64)) % 64;
  header = header + " ".repeat(pad) + "\n";
  const body = new Float32Array(values);
  const buf = new ArrayBuffer(10 + header.length + body.byteLength);
  const bytes = new Uint8Array(buf);
  bytes.set([0x93, 0x4e, 0x55, 0x4d, 0x50, 0x59, 1, 0], 0); // \x93NUMPY v1.0
  new DataView(buf).setUint16(8, header.length, true);
  bytes.set(enc.encode(header), 10);
  new Uint8Array(buf, 10 + header.length).set(new Uint8Array(body.buffer));
  return buf;
}

describe("parseFlo guards", () => {
  it("parses a well-formed .flo", () => {
    const f = parseFlo(makeFlo(2, 2), "a.flo");
    expect(f.width).toBe(2);
    expect(f.height).toBe(2);
    expect(f.data.length).toBe(8);
  });

  it("rejects illegal dimensions", () => {
    const buf = makeFlo(1, 1);
    new DataView(buf).setInt32(4, -5, true);
    expect(() => parseFlo(buf, "bad.flo")).toThrow(/illegal/i);
  });

  it("rejects a truncated body", () => {
    const buf = makeFlo(4, 4, 2); // header says 4x4 but only 2 floats of data
    expect(() => parseFlo(buf, "trunc.flo")).toThrow(/truncated/i);
  });
});

describe("parseNpy guards", () => {
  it("parses a C-order (H,W,2) array", () => {
    const buf = makeNpy("{'descr': '<f4', 'fortran_order': False, 'shape': (1, 2, 2), }", [1, 2, 3, 4]);
    const f = parseNpy(buf, "a.npy");
    expect([f.width, f.height]).toEqual([2, 1]);
  });

  it("rejects Fortran-order arrays", () => {
    const buf = makeNpy("{'descr': '<f4', 'fortran_order': True, 'shape': (1, 2, 2), }", [1, 2, 3, 4]);
    expect(() => parseNpy(buf, "f.npy")).toThrow(/fortran/i);
  });
});
