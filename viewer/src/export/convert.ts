/**
 * Flow format converter — turns loaded FlowField(s) into any supported on-disk
 * format. Reuses the pure raw-flow writers (writers.ts) and the CPU colorizer.
 * A single frame yields one file; multiple frames yield a ZIP. All main-thread:
 * the writers are pure and fast, and this keeps the download one interaction away.
 */

import { zipSync, type Zippable } from "fflate";
import type { FlowField } from "../flow";
import { encodeFlo, encodeKittiPng, encodePfm, encodeNpy } from "./writers";
import { colorizeFlow, sequenceMaxFlow } from "./colorize";

export type ConvertFormat = "flo" | "kitti" | "pfm" | "npy" | "color";

export interface FormatMeta {
  id: ConvertFormat;
  label: string; // short name shown on the button
  sub: string; // tiny type hint under the name
  ext: string; // output extension (with dot)
  mime: string;
  desc: string; // tooltip
  /** True when the format can't be parsed back into u,v (colorized preview). */
  lossy?: boolean;
}

export const FORMATS: FormatMeta[] = [
  { id: "flo", label: ".flo", sub: "float32", ext: ".flo", mime: "application/octet-stream",
    desc: "Middlebury .flo — 32-bit float u,v" },
  { id: "kitti", label: "KITTI", sub: "16-bit", ext: ".png", mime: "image/png",
    desc: "KITTI 16-bit PNG — u,v quantized to 1/64 px + validity mask" },
  { id: "pfm", label: ".pfm", sub: "float32", ext: ".pfm", mime: "application/octet-stream",
    desc: "Sintel .pfm — 32-bit float, bottom-up, 3 channels (u,v,valid)" },
  { id: "npy", label: ".npy", sub: "float32", ext: ".npy", mime: "application/octet-stream",
    desc: "NumPy .npy — (H, W, 2) float32, C-order" },
  { id: "color", label: "Color", sub: "8-bit", ext: ".png", mime: "image/png",
    desc: "Colorized 8-bit PNG — a visualization, not re-parseable flow", lossy: true },
];

export const formatMeta = (id: ConvertFormat): FormatMeta =>
  FORMATS.find((m) => m.id === id)!;

/** Strip the last extension so we can swap in the target one. */
export function baseName(name: string): string {
  return (name || "flow").replace(/\.[^./\\]+$/, "");
}

/** Human-readable source format of a loaded frame, inferred from its name. */
export function sourceLabel(name: string): string {
  const lower = (name || "").toLowerCase();
  if (lower.endsWith(".flo")) return ".flo";
  if (lower.endsWith(".pfm")) return ".pfm";
  if (lower.endsWith(".npy")) return ".npy";
  if (lower.endsWith(".png")) return "KITTI";
  return ".flo";
}

async function colorPng(f: FlowField, maxFlow: number): Promise<Uint8Array> {
  const rgba = colorizeFlow(f, maxFlow);
  const canvas = document.createElement("canvas");
  canvas.width = f.width;
  canvas.height = f.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable for PNG export.");
  ctx.putImageData(new ImageData(rgba, f.width, f.height), 0, 0);
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/png"));
  if (!blob) throw new Error("PNG encoding failed.");
  return new Uint8Array(await blob.arrayBuffer());
}

/** Encode one frame to the target format's bytes. */
export async function encodeFrame(
  f: FlowField,
  fmt: ConvertFormat,
  maxFlow: number,
): Promise<Uint8Array> {
  switch (fmt) {
    case "flo":
      return encodeFlo(f);
    case "kitti":
      return encodeKittiPng(f);
    case "pfm":
      return encodePfm(f);
    case "npy":
      return encodeNpy(f);
    case "color":
      return colorPng(f, maxFlow);
  }
}

export interface ConvertResult {
  blob: Blob;
  filename: string;
  count: number;
}

/**
 * Convert the frames at `indices` to `fmt`. One index → a single file; many →
 * a ZIP (PNGs stored, raw flows deflated). Color uses a sequence-wide normalizer
 * so a batch of colorized frames stays flicker-free.
 */
export async function convert(
  frames: FlowField[],
  indices: number[],
  fmt: ConvertFormat,
): Promise<ConvertResult> {
  const meta = formatMeta(fmt);
  const maxFlow = fmt === "color" ? sequenceMaxFlow(indices.map((i) => frames[i])) : 0;

  if (indices.length === 1) {
    const f = frames[indices[0]];
    const bytes = await encodeFrame(f, fmt, maxFlow);
    return {
      blob: new Blob([bytes], { type: meta.mime }),
      filename: baseName(f.name) + meta.ext,
      count: 1,
    };
  }

  const files: Zippable = {};
  const png = { level: 0 as const }; // already compressed
  const raw = { level: 6 as const };
  const used = new Set<string>();
  for (let k = 0; k < indices.length; k++) {
    const f = frames[indices[k]];
    const bytes = await encodeFrame(f, fmt, maxFlow);
    let entry = baseName(f.name) + meta.ext;
    if (used.has(entry)) entry = `${baseName(f.name)}_${String(k + 1).padStart(4, "0")}${meta.ext}`;
    used.add(entry);
    files[entry] = [bytes, meta.mime === "image/png" ? png : raw];
  }
  const stem = baseName(frames[indices[0]].name).replace(/[_-]?\d+$/, "") || "flow";
  const zip = zipSync(files);
  return {
    blob: new Blob([zip], { type: "application/zip" }),
    filename: `${stem}-${fmt}.zip`,
    count: indices.length,
  };
}
