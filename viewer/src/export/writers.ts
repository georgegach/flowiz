/**
 * Raw-flow writers — the encode counterparts of the parsers in flow.ts.
 * Each is pure (FlowField -> Uint8Array) and round-trips through its parser.
 */

import type { FlowField } from "../flow";
import { encodePng16 } from "./png16";

const FLO_TAG = 202021.25;

/** Middlebury .flo: tag, int32 w, int32 h, interleaved u,v float32 — all little-endian. */
export function encodeFlo(f: FlowField): Uint8Array {
  const out = new Uint8Array(12 + f.width * f.height * 2 * 4);
  const dv = new DataView(out.buffer);
  dv.setFloat32(0, FLO_TAG, true);
  dv.setInt32(4, f.width, true);
  dv.setInt32(8, f.height, true);
  let off = 12;
  for (let i = 0; i < f.data.length; i++) {
    dv.setFloat32(off, f.data[i], true);
    off += 4;
  }
  return out;
}

/** KITTI 16-bit flow PNG: R=u*64+32768, G=v*64+32768, B=valid?1:0; invalid → R=G=0. */
export function encodeKittiPng(f: FlowField): Uint8Array {
  const n = f.width * f.height;
  const samples = new Uint16Array(n * 3);
  for (let i = 0; i < n; i++) {
    const valid = f.valid ? f.valid[i] !== 0 : true;
    if (valid) {
      samples[i * 3] = clamp16(Math.round(f.data[i * 2] * 64 + 32768));
      samples[i * 3 + 1] = clamp16(Math.round(f.data[i * 2 + 1] * 64 + 32768));
      samples[i * 3 + 2] = 1;
    } else {
      samples[i * 3] = 0;
      samples[i * 3 + 1] = 0;
      samples[i * 3 + 2] = 0;
    }
  }
  return encodePng16(f.width, f.height, samples);
}

/** Sintel .pfm: "PF" header, scale -1.0 (little-endian), rows bottom-up, 3 channels (u,v,valid). */
export function encodePfm(f: FlowField): Uint8Array {
  const { width: w, height: h } = f;
  const header = `PF\n${w} ${h}\n-1.0\n`;
  const headerBytes = new Uint8Array(header.length);
  for (let i = 0; i < header.length; i++) headerBytes[i] = header.charCodeAt(i);

  const body = new Float32Array(w * h * 3);
  const dv = new DataView(body.buffer);
  for (let y = 0; y < h; y++) {
    const dst = (h - 1 - y) * w * 3; // bottom-up
    for (let x = 0; x < w; x++) {
      const si = (y * w + x) * 2;
      const di = dst + x * 3;
      dv.setFloat32(di * 4, f.data[si], true);
      dv.setFloat32((di + 1) * 4, f.data[si + 1], true);
      dv.setFloat32((di + 2) * 4, f.valid ? (f.valid[y * w + x] ? 1 : 0) : 1, true);
    }
  }
  const out = new Uint8Array(headerBytes.length + body.byteLength);
  out.set(headerBytes, 0);
  out.set(new Uint8Array(body.buffer), headerBytes.length);
  return out;
}

/** NumPy .npy v1.0, '<f4', shape (H, W, 2), C-order — f.data verbatim. */
export function encodeNpy(f: FlowField): Uint8Array {
  const dict = `{'descr': '<f4', 'fortran_order': False, 'shape': (${f.height}, ${f.width}, 2), }`;
  // magic(6) + version(2) + headerLen(2) = 10 bytes before the header text;
  // pad the header with spaces so (10 + headerLen) is a multiple of 64, end with '\n'.
  let headerLen = dict.length + 1; // + trailing '\n'
  const pad = (64 - ((10 + headerLen) % 64)) % 64;
  headerLen += pad;
  const header = dict + " ".repeat(pad) + "\n";

  const out = new Uint8Array(10 + headerLen + f.data.byteLength);
  out[0] = 0x93;
  out.set([0x4e, 0x55, 0x4d, 0x50, 0x59], 1); // "NUMPY"
  out[6] = 1; // major
  out[7] = 0; // minor
  new DataView(out.buffer).setUint16(8, headerLen, true);
  for (let i = 0; i < header.length; i++) out[10 + i] = header.charCodeAt(i);
  out.set(new Uint8Array(f.data.buffer, f.data.byteOffset, f.data.byteLength), 10 + headerLen);
  return out;
}

function clamp16(v: number): number {
  return v < 0 ? 0 : v > 65535 ? 65535 : v;
}
