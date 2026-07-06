/**
 * RAFT model registry — the single source of truth for the browser viewer,
 * imported by both the worker (raft.ts) and the settings UI (generate-panel).
 *
 * Adding a model = adding one entry here plus committing its .onnx under
 * viewer/public/models/ (see .github/workflows/build-assets.yml). The input
 * resolution is encoded in the filename, which doubles as a cache-buster: a new
 * resolution is a new URL, so Cache Storage never serves a stale tensor shape.
 */

export interface RaftModelSpec {
  /** Stable id — also the persisted selection value. */
  id: string;
  label: string;
  /** On-disk size in bytes; rendered as "~N MB download". Update when the file changes. */
  bytes: number;
  /** Filename under baseUrl + "models/". */
  file: string;
  inputW: number;
  inputH: number;
  /** signed = 2*x/255-1 ; raw = x (0..255) — MUST match how the .onnx was exported. */
  pixelRange: "signed" | "raw";
  /** One-line "what you get", shown under the model picker. */
  blurb?: string;
}

export const RAFT_MODELS: RaftModelSpec[] = [
  {
    // torchvision raft_small (C_T_V2) exported to ONNX by
    // .github/scripts/fetch_raft_models.py. [-1,1] input, single full-res output;
    // both verified empirically (0.09px EPE on the shift test).
    id: "raft-small-360x480",
    label: "Balanced — RAFT small",
    bytes: 4_234_030,
    file: "raft-small-360x480.onnx",
    inputW: 480,
    inputH: 360,
    pixelRange: "signed",
    blurb: "Small neural net (RAFT) — much sharper than DIS at only ~4 MB, and faster per frame than the large model.",
  },
  {
    // OpenCV-zoo RAFT (2023aug) fp32. Wants [-1,1] input — verified empirically.
    id: "raft-large-360x480",
    label: "Best — RAFT large",
    bytes: 64_119_337,
    file: "raft-large-360x480.onnx",
    inputW: 480,
    inputH: 360,
    pixelRange: "signed",
    blurb: "Full RAFT network — the most accurate flow, but a large download and slower per frame.",
  },
];

/** Resolve a persisted/opts model id, falling back to the first model on anything stale. */
export function raftModelById(id?: string | null): RaftModelSpec {
  return RAFT_MODELS.find((m) => m.id === id) ?? RAFT_MODELS[0];
}
