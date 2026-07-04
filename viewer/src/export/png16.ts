/**
 * Minimal 16-bit truecolor (RGB, colorType 2) PNG encoder.
 * Samples are written big-endian, filter 0 on every row — the mirror of the
 * decoder in flow.ts (`decodePng`/`unfilter`), which reads 16-bit as (hi<<8)|lo.
 * Compression via pako deflate; CRC32 implemented here (pako doesn't export one).
 */

import { deflate } from "pako";

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  // CRC covers the type + data bytes.
  dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

/** Encode `samples` (RGB, row-major, length width*height*3) as a 16-bit PNG. */
export function encodePng16(width: number, height: number, samples: Uint16Array): Uint8Array {
  const channels = 3;
  if (samples.length !== width * height * channels) {
    throw new Error("encodePng16: samples length mismatch");
  }
  // Raw scanlines: each row = filter byte 0, then big-endian 16-bit samples.
  const stride = width * channels * 2;
  const raw = new Uint8Array(height * (1 + stride));
  let p = 0;
  for (let y = 0; y < height; y++) {
    raw[p++] = 0; // filter type: none
    const rowStart = y * width * channels;
    for (let x = 0; x < width * channels; x++) {
      const v = samples[rowStart + x] & 0xffff;
      raw[p++] = v >>> 8;
      raw[p++] = v & 0xff;
    }
  }

  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, width);
  dv.setUint32(4, height);
  ihdr[8] = 16; // bit depth
  ihdr[9] = 2; // color type: truecolor RGB
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const idat = deflate(raw);
  const parts = [
    new Uint8Array(SIGNATURE),
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", new Uint8Array(0)),
  ];
  const total = parts.reduce((a, c) => a + c.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const part of parts) {
    out.set(part, o);
    o += part.length;
  }
  return out;
}
