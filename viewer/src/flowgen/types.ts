/** Shared types + worker message protocol for flow generation. Imported by both sides. */

export type ModelTier = "dis" | "raft-small" | "raft-large";
export type DisPreset = "ultrafast" | "fast" | "medium";
export type ExecutionProvider = "wasm" | "webgpu";

export interface GenOptions {
  tier: ModelTier;
  disPreset?: DisPreset; // DIS only
  raftIters?: number; // RAFT only, if the export accepts it
  ep: "auto" | ExecutionProvider; // default "auto"
}

export interface RGBAFrame {
  width: number;
  height: number;
  data: ArrayBuffer; // RGBA8, width*height*4 — always in the transfer list
  timestampUs: number;
}

export interface SerializedFlow {
  width: number;
  height: number;
  data: ArrayBuffer; // Float32 interleaved u,v
  valid?: ArrayBuffer; // Uint8 per-pixel validity
  name: string;
}

export type WorkerRequest =
  | { type: "init"; id: number; opts: GenOptions; baseUrl: string }
  | { type: "frame"; id: number; index: number; frame: RGBAFrame }
  | { type: "encode-zip"; id: number; frames: SerializedFlow[]; baseName: string }
  | { type: "encode-gif"; id: number; frames: SerializedFlow[]; fps: number; sharedMax: number }
  | {
      type: "encode-mp4";
      id: number;
      frames: SerializedFlow[];
      fps: number;
      sharedMax: number;
      codec: string;
    }
  | { type: "dispose" };

export type WorkerResponse =
  | { type: "ready"; id: number; ep: ExecutionProvider }
  | { type: "flow"; id: number; index: number; flow: SerializedFlow }
  | { type: "progress"; id: number; phase: string; done: number; total: number }
  | { type: "blob"; id: number; buffer: ArrayBuffer; mime: string; filename: string }
  | { type: "error"; id: number; message: string };
