/** In-browser optical flow parsing for .flo, KITTI PNG, .pfm and .npy. */

import { inflate } from "pako";

export interface FlowField {
  width: number;
  height: number;
  /** Interleaved u,v — length width*height*2, Float32. */
  data: Float32Array;
  /** Optional per-pixel validity (length width*height). */
  valid?: Uint8Array;
  name: string;
}

export function maxMagnitude(f: FlowField): number {
  let mx = 0;
  for (let i = 0; i < f.data.length; i += 2) {
    const u = f.data[i];
    const v = f.data[i + 1];
    if (!isFinite(u) || !isFinite(v)) continue;
    const m = Math.hypot(u, v);
    if (m > mx) mx = m;
  }
  return mx;
}

const FLO_TAG = 202021.25;

export function parseFlo(buf: ArrayBuffer, name: string): FlowField {
  const dv = new DataView(buf);
  const tag = dv.getFloat32(0, true);
  if (Math.abs(tag - FLO_TAG) > 1e-3) {
    throw new Error(`${name}: not a valid .flo (tag ${tag}).`);
  }
  const width = dv.getInt32(4, true);
  const height = dv.getInt32(8, true);
  const data = new Float32Array(width * height * 2);
  let off = 12;
  for (let i = 0; i < data.length; i++) {
    data[i] = dv.getFloat32(off, true);
    off += 4;
  }
  return { width, height, data, name };
}

export function parsePfm(buf: ArrayBuffer, name: string): FlowField {
  const bytes = new Uint8Array(buf);
  let pos = 0;
  const readLine = (): string => {
    let s = "";
    while (pos < bytes.length && bytes[pos] !== 0x0a) s += String.fromCharCode(bytes[pos++]);
    pos++; // consume newline
    return s.trim();
  };
  const header = readLine();
  if (header !== "PF" && header !== "Pf") throw new Error(`${name}: not a PFM file.`);
  const channels = header === "PF" ? 3 : 1;
  if (channels === 1) throw new Error(`${name}: single-channel PFM is not a flow field.`);
  const [w, h] = readLine().split(/\s+/).map(Number);
  const scale = parseFloat(readLine());
  const little = scale < 0;
  const dv = new DataView(buf, pos);
  const raw = new Float32Array(w * h * channels);
  for (let i = 0; i < raw.length; i++) raw[i] = dv.getFloat32(i * 4, little);

  // PFM rows are bottom-to-top; flip and take first 2 channels.
  const data = new Float32Array(w * h * 2);
  const valid = channels >= 3 ? new Uint8Array(w * h) : undefined;
  for (let y = 0; y < h; y++) {
    const src = (h - 1 - y) * w * channels;
    for (let x = 0; x < w; x++) {
      const di = (y * w + x) * 2;
      data[di] = raw[src + x * channels];
      data[di + 1] = raw[src + x * channels + 1];
      if (valid) valid[y * w + x] = raw[src + x * channels + 2] > 0 ? 1 : 0;
    }
  }
  return { width: w, height: h, data, valid, name };
}

export function parseNpy(buf: ArrayBuffer, name: string): FlowField {
  const bytes = new Uint8Array(buf);
  const magic = String.fromCharCode(...bytes.slice(1, 6));
  if (magic !== "NUMPY") throw new Error(`${name}: not a .npy file.`);
  const major = bytes[6];
  const headerLen =
    major >= 2
      ? new DataView(buf).getUint32(8, true)
      : new DataView(buf).getUint16(8, true);
  const headerStart = major >= 2 ? 12 : 10;
  const header = String.fromCharCode(...bytes.slice(headerStart, headerStart + headerLen));
  const descr = /'descr':\s*'([^']+)'/.exec(header)?.[1] ?? "<f4";
  const shapeMatch = /'shape':\s*\(([^)]*)\)/.exec(header)?.[1] ?? "";
  const shape = shapeMatch
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map(Number);
  const dataStart = headerStart + headerLen;
  const little = descr[0] !== ">";
  const dv = new DataView(buf, dataStart);
  const isF8 = descr.includes("f8");
  const count = shape.reduce((a, b) => a * b, 1);
  const flat = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    flat[i] = isF8 ? dv.getFloat64(i * 8, little) : dv.getFloat32(i * 4, little);
  }

  let h: number, w: number, chwFirst: boolean;
  if (shape.length === 3 && shape[2] === 2) {
    [h, w] = shape;
    chwFirst = false;
  } else if (shape.length === 3 && shape[0] === 2) {
    [, h, w] = shape;
    chwFirst = true;
  } else {
    throw new Error(`${name}: expected shape (H,W,2) or (2,H,W), got (${shape}).`);
  }
  const data = new Float32Array(w * h * 2);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const di = (y * w + x) * 2;
      if (chwFirst) {
        data[di] = flat[y * w + x];
        data[di + 1] = flat[w * h + y * w + x];
      } else {
        data[di] = flat[(y * w + x) * 2];
        data[di + 1] = flat[(y * w + x) * 2 + 1];
      }
    }
  }
  return { width: w, height: h, data, name };
}

/** KITTI 16-bit flow PNG. flow = (val - 2^15)/64; channel 3 is validity. */
export function parseKittiPng(buf: ArrayBuffer, name: string): FlowField {
  const { width, height, channels, bitDepth, samples } = decodePng(buf);
  if (bitDepth !== 16 || channels < 3) {
    throw new Error(`${name}: not a KITTI flow PNG (need 16-bit RGB, got ${bitDepth}-bit ${channels}ch).`);
  }
  const data = new Float32Array(width * height * 2);
  const valid = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const r = samples[i * channels];
    const g = samples[i * channels + 1];
    const b = samples[i * channels + 2];
    const isValid = b > 0;
    data[i * 2] = isValid ? (r - 32768) / 64 : 0;
    data[i * 2 + 1] = isValid ? (g - 32768) / 64 : 0;
    valid[i] = isValid ? 1 : 0;
  }
  return { width, height, data, valid, name };
}

interface DecodedPng {
  width: number;
  height: number;
  channels: number;
  bitDepth: number;
  samples: Uint16Array;
}

/** Minimal PNG decoder for 16-bit truecolor (KITTI), via pako inflate. */
function decodePng(buf: ArrayBuffer): DecodedPng {
  const bytes = new Uint8Array(buf);
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  for (let i = 0; i < 8; i++) if (bytes[i] !== sig[i]) throw new Error("Not a PNG.");
  let pos = 8;
  let width = 0,
    height = 0,
    bitDepth = 0,
    colorType = 0;
  const idat: Uint8Array[] = [];
  const dv = new DataView(buf);
  while (pos < bytes.length) {
    const len = dv.getUint32(pos);
    const type = String.fromCharCode(bytes[pos + 4], bytes[pos + 5], bytes[pos + 6], bytes[pos + 7]);
    const start = pos + 8;
    if (type === "IHDR") {
      width = dv.getUint32(start);
      height = dv.getUint32(start + 4);
      bitDepth = bytes[start + 8];
      colorType = bytes[start + 9];
    } else if (type === "IDAT") {
      idat.push(bytes.slice(start, start + len));
    } else if (type === "IEND") {
      break;
    }
    pos = start + len + 4; // skip data + CRC
  }
  const channels = colorType === 2 ? 3 : colorType === 6 ? 4 : colorType === 0 ? 1 : 2;
  const compressed = concat(idat);
  const raw = inflate(compressed);
  const samples = unfilter(raw, width, height, channels, bitDepth);
  return { width, height, channels, bitDepth, samples };
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((a, c) => a + c.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

/** PNG defiltering for 16-bit samples; returns big-endian-decoded Uint16 samples. */
function unfilter(
  raw: Uint8Array,
  width: number,
  height: number,
  channels: number,
  bitDepth: number,
): Uint16Array {
  const bytesPerSample = bitDepth / 8;
  const bpp = channels * bytesPerSample;
  const stride = width * bpp;
  const out = new Uint8Array(height * stride);
  let pos = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[pos++];
    const row = y * stride;
    for (let x = 0; x < stride; x++) {
      const rawByte = raw[pos++];
      const a = x >= bpp ? out[row + x - bpp] : 0;
      const b = y > 0 ? out[row - stride + x] : 0;
      const c = x >= bpp && y > 0 ? out[row - stride + x - bpp] : 0;
      let val = rawByte;
      switch (filter) {
        case 1:
          val = rawByte + a;
          break;
        case 2:
          val = rawByte + b;
          break;
        case 3:
          val = rawByte + ((a + b) >> 1);
          break;
        case 4:
          val = rawByte + paeth(a, b, c);
          break;
      }
      out[row + x] = val & 0xff;
    }
  }
  const samples = new Uint16Array(width * height * channels);
  if (bitDepth === 16) {
    for (let i = 0; i < samples.length; i++) {
      samples[i] = (out[i * 2] << 8) | out[i * 2 + 1]; // PNG is big-endian
    }
  } else {
    for (let i = 0; i < samples.length; i++) samples[i] = out[i];
  }
  return samples;
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

export function parseByName(buf: ArrayBuffer, name: string): FlowField {
  const lower = name.toLowerCase();
  if (lower.endsWith(".flo")) return parseFlo(buf, name);
  if (lower.endsWith(".pfm")) return parsePfm(buf, name);
  if (lower.endsWith(".npy")) return parseNpy(buf, name);
  if (lower.endsWith(".png")) return parseKittiPng(buf, name);
  // Fallback: sniff the .flo tag.
  if (buf.byteLength >= 4 && Math.abs(new DataView(buf).getFloat32(0, true) - FLO_TAG) < 1e-3) {
    return parseFlo(buf, name);
  }
  throw new Error(`${name}: unsupported format (use .flo, KITTI .png, .pfm, or .npy).`);
}
