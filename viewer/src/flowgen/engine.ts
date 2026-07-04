/**
 * Main-thread facade over the flow-generation worker. One in-flight inference
 * at a time (the generation loop awaits pushFrame sequentially, which also keeps
 * the worker's prev-frame cache correct). dispose() terminates the worker —
 * that is also how Cancel works.
 */

import type { FlowField } from "../flow";
import type {
  ExecutionProvider,
  GenOptions,
  RGBAFrame,
  SerializedFlow,
  WorkerRequest,
  WorkerResponse,
} from "./types";

function serialize(f: FlowField): SerializedFlow {
  // Copy so the main-thread frame survives (worker receives a structured clone).
  return {
    width: f.width,
    height: f.height,
    data: f.data.slice().buffer,
    valid: f.valid ? f.valid.slice().buffer : undefined,
    name: f.name,
  };
}

function deserialize(s: SerializedFlow): FlowField {
  return {
    width: s.width,
    height: s.height,
    data: new Float32Array(s.data),
    valid: s.valid ? new Uint8Array(s.valid) : undefined,
    name: s.name,
  };
}

export class FlowEngine {
  private worker: Worker;
  private nextId = 1;
  private readyResolve: ((ep: ExecutionProvider) => void) | null = null;
  private readyReject: ((e: Error) => void) | null = null;
  private pendingFlow = new Map<number, (f: FlowField) => void>();
  private pendingBlob: ((b: Blob) => void) | null = null;
  private errored: ((e: Error) => void) | null = null;
  onProgress?: (phase: string, done: number, total: number) => void;

  constructor() {
    this.worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    this.worker.onmessage = (ev: MessageEvent<WorkerResponse>) => this.onMessage(ev.data);
    this.worker.onerror = (e) => {
      const err = new Error(e.message || "Worker crashed");
      this.readyReject?.(err);
      this.pendingBlob = null;
      this.errored?.(err);
    };
  }

  private send(msg: WorkerRequest, transfer: Transferable[] = []) {
    this.worker.postMessage(msg, transfer);
  }

  private onMessage(msg: WorkerResponse) {
    switch (msg.type) {
      case "ready":
        this.readyResolve?.(msg.ep);
        break;
      case "flow": {
        const resolve = this.pendingFlow.get(msg.index);
        if (resolve) {
          this.pendingFlow.delete(msg.index);
          resolve(deserialize(msg.flow));
        }
        break;
      }
      case "progress":
        this.onProgress?.(msg.phase, msg.done, msg.total);
        break;
      case "blob":
        this.pendingBlob?.(new Blob([msg.buffer], { type: msg.mime }));
        this.pendingBlob = null;
        break;
      case "error": {
        const err = new Error(msg.message);
        this.readyReject?.(err);
        this.errored?.(err);
        break;
      }
    }
  }

  init(opts: GenOptions, baseUrl: string): Promise<ExecutionProvider> {
    return new Promise((resolve, reject) => {
      this.readyResolve = resolve;
      this.readyReject = reject;
      this.send({ type: "init", id: this.nextId++, opts, baseUrl });
    });
  }

  /** index 0 primes the worker's prev cache and resolves null; index ≥ 1 returns flow. */
  pushFrame(frame: RGBAFrame, index: number): Promise<FlowField | null> {
    const id = this.nextId++;
    if (index === 0) {
      this.send({ type: "frame", id, index, frame }, [frame.data]);
      return Promise.resolve(null);
    }
    return new Promise((resolve, reject) => {
      this.errored = reject;
      this.pendingFlow.set(index, resolve);
      this.send({ type: "frame", id, index, frame }, [frame.data]);
    });
  }

  private awaitBlob(msg: WorkerRequest): Promise<Blob> {
    return new Promise((resolve, reject) => {
      this.pendingBlob = resolve;
      this.errored = reject;
      this.send(msg);
    });
  }

  encodeZip(frames: FlowField[], baseName: string): Promise<Blob> {
    return this.awaitBlob({
      type: "encode-zip",
      id: this.nextId++,
      frames: frames.map(serialize),
      baseName,
    });
  }

  encodeGif(frames: FlowField[], fps: number, sharedMax: number): Promise<Blob> {
    return this.awaitBlob({
      type: "encode-gif",
      id: this.nextId++,
      frames: frames.map(serialize),
      fps,
      sharedMax,
    });
  }

  encodeMp4(frames: FlowField[], fps: number, sharedMax: number, codec: string): Promise<Blob> {
    return this.awaitBlob({
      type: "encode-mp4",
      id: this.nextId++,
      frames: frames.map(serialize),
      fps,
      sharedMax,
      codec,
    });
  }

  dispose() {
    try {
      this.send({ type: "dispose" });
    } catch {
      /* ignore */
    }
    this.worker.terminate();
  }
}
