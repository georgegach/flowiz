/**
 * Flow-generation worker: hosts the model (DIS or RAFT), computes flow for
 * consecutive frame pairs (caches the previous frame so we never touch a
 * transferred buffer twice), and runs the CPU-heavy exporters.
 */

import type {
  GenOptions,
  ProgressKind,
  RGBAFrame,
  SerializedFlow,
  WorkerRequest,
  WorkerResponse,
} from "./types";
import { createDis, type DisEngine } from "./dis";
import { createRaft, type RaftEngine } from "./raft";
import { raftModelById } from "./models";
import { buildRawZip } from "../export/zip";
import { encodeGif } from "../export/gif";
import { encodeMp4 } from "../export/mp4";
import { colorizeFlow } from "../export/colorize";
import type { FlowField } from "../flow";

let dis: DisEngine | null = null;
let raft: RaftEngine | null = null;
let prev: RGBAFrame | null = null;

// self.postMessage in a worker takes (message, transfer[]); the DOM lib types
// the global as Window.postMessage, so go through `any` to get the worker form.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const post = (msg: WorkerResponse, transfer: Transferable[] = []) =>
  (self as any).postMessage(msg, transfer);

function toFlowField(s: SerializedFlow): FlowField {
  return {
    width: s.width,
    height: s.height,
    data: new Float32Array(s.data),
    valid: s.valid ? new Uint8Array(s.valid) : undefined,
    name: s.name,
  };
}

async function colorPng(f: FlowField, maxFlow: number): Promise<Uint8Array> {
  const rgba = colorizeFlow(f, maxFlow);
  const canvas = new OffscreenCanvas(f.width, f.height);
  canvas.getContext("2d")!.putImageData(new ImageData(rgba, f.width, f.height), 0, 0);
  const blob = await canvas.convertToBlob({ type: "image/png" });
  return new Uint8Array(await blob.arrayBuffer());
}

async function init(id: number, opts: GenOptions, baseUrl: string) {
  prev = null;
  const onProgress = (phase: string, done: number, total: number, kind: ProgressKind) =>
    post({ type: "progress", id, phase, done, total, kind });
  if (opts.tier === "dis") {
    dis = await createDis(baseUrl, opts.disPreset ?? "fast", onProgress);
    post({ type: "ready", id, ep: "wasm" });
  } else {
    raft = await createRaft(baseUrl, raftModelById(opts.raftModelId), opts.ep, onProgress);
    post({ type: "ready", id, ep: raft.ep });
  }
}

async function onFrame(id: number, index: number, frame: RGBAFrame) {
  if (index === 0 || !prev) {
    prev = frame;
    return;
  }
  const flow = dis ? dis.compute(prev, frame) : await raft!.compute(prev, frame);
  prev = frame;
  post({ type: "flow", id, index, flow }, [flow.data]);
}

self.onmessage = async (ev: MessageEvent) => {
  const msg = ev.data as WorkerRequest;
  try {
    switch (msg.type) {
      case "init":
        await init(msg.id, msg.opts, msg.baseUrl);
        break;
      case "frame":
        await onFrame(msg.id, msg.index, msg.frame);
        break;
      case "encode-zip": {
        const fields = msg.frames.map(toFlowField);
        const { sequenceMaxFlow } = await import("../export/colorize");
        const mx = sequenceMaxFlow(fields);
        const pngs: Uint8Array[] = [];
        for (const f of fields) pngs.push(await colorPng(f, mx));
        const zip = buildRawZip(fields, pngs, msg.baseName);
        post(
          { type: "blob", id: msg.id, buffer: zip.buffer as ArrayBuffer, mime: "application/zip", filename: `${msg.baseName}.zip` },
          [zip.buffer as ArrayBuffer],
        );
        break;
      }
      case "encode-gif": {
        const gif = encodeGif(msg.frames, msg.fps, msg.sharedMax);
        post(
          { type: "blob", id: msg.id, buffer: gif.buffer as ArrayBuffer, mime: "image/gif", filename: "flow.gif" },
          [gif.buffer as ArrayBuffer],
        );
        break;
      }
      case "encode-mp4": {
        const mp4 = await encodeMp4(msg.frames, msg.fps, msg.sharedMax, msg.codec);
        post(
          { type: "blob", id: msg.id, buffer: mp4.buffer as ArrayBuffer, mime: "video/mp4", filename: "flow.mp4" },
          [mp4.buffer as ArrayBuffer],
        );
        break;
      }
      case "dispose":
        dis?.dispose();
        raft?.dispose();
        dis = raft = null;
        prev = null;
        break;
    }
  } catch (e) {
    post({ type: "error", id: (msg as { id?: number }).id ?? -1, message: (e as Error).message });
  }
};
