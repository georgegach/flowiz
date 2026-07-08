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
  ProgressKind,
  RGBAFrame,
  SerializedFlow,
  WorkerRequest,
  WorkerResponse,
} from "./types";

/** Thrown to pending promises when the engine is disposed mid-flight (Cancel). */
export class CancelledError extends Error {
  constructor() {
    super("cancelled");
    this.name = "CancelledError";
  }
}

function serialize(f: FlowField): SerializedFlow {
  // Copy so the main-thread frame survives (the copy is handed to the worker).
  return {
    width: f.width,
    height: f.height,
    data: f.data.slice().buffer,
    valid: f.valid ? f.valid.slice().buffer : undefined,
    name: f.name,
  };
}

// Serialize a whole sequence and collect its (freshly-copied, throwaway)
// buffers as transferables — moving them to the worker avoids a second full
// structured-clone of every frame on postMessage.
function serializeAll(frames: FlowField[]): { frames: SerializedFlow[]; transfer: Transferable[] } {
  const out: SerializedFlow[] = [];
  const transfer: Transferable[] = [];
  for (const f of frames) {
    const s = serialize(f);
    out.push(s);
    transfer.push(s.data);
    if (s.valid) transfer.push(s.valid);
  }
  return { frames: out, transfer };
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
  private disposed = false;
  private readyReject: ((e: Error) => void) | null = null;
  private readyResolve: ((ep: ExecutionProvider) => void) | null = null;
  private pendingFlow = new Map<number, { resolve: (f: FlowField) => void; reject: (e: Error) => void }>();
  private pendingBlob: ((b: Blob) => void) | null = null;
  private errored: ((e: Error) => void) | null = null;
  private deadError: Error | null = null;
  onProgress?: (phase: string, done: number, total: number, kind: ProgressKind) => void;

  constructor() {
    this.worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    this.worker.onmessage = (ev: MessageEvent<WorkerResponse>) => this.onMessage(ev.data);
    // A native worker crash fires once and only once. Reject everything in flight
    // AND latch the error, so a crash during the priming (index 0) frame — which
    // registers no pending promise — can't strand the next pushFrame forever.
    this.worker.onerror = (e) => {
      const err = new Error(e.message || "Worker crashed");
      this.deadError = err;
      this.readyReject?.(err);
      this.readyReject = this.readyResolve = null;
      for (const { reject } of this.pendingFlow.values()) reject(err);
      this.pendingFlow.clear();
      this.pendingBlob = null;
      this.errored?.(err);
      this.errored = null;
    };
  }

  private send(msg: WorkerRequest, transfer: Transferable[] = []) {
    if (this.disposed) throw new CancelledError();
    if (this.deadError) throw this.deadError; // worker already crashed — fail fast
    this.worker.postMessage(msg, transfer);
  }

  private onMessage(msg: WorkerResponse) {
    if (this.disposed) return; // ignore a message already queued before terminate()
    switch (msg.type) {
      case "ready":
        this.readyResolve?.(msg.ep);
        break;
      case "flow": {
        const pending = this.pendingFlow.get(msg.index);
        if (pending) {
          this.pendingFlow.delete(msg.index);
          pending.resolve(deserialize(msg.flow));
        }
        break;
      }
      case "progress":
        this.onProgress?.(msg.phase, msg.done, msg.total, msg.kind ?? "indeterminate");
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
      this.pendingFlow.set(index, { resolve, reject });
      this.send({ type: "frame", id, index, frame }, [frame.data]);
    });
  }

  private awaitBlob(msg: WorkerRequest, transfer: Transferable[] = []): Promise<Blob> {
    return new Promise((resolve, reject) => {
      this.pendingBlob = resolve;
      this.errored = reject;
      this.send(msg, transfer);
    });
  }

  encodeZip(frames: FlowField[], baseName: string): Promise<Blob> {
    const { frames: ser, transfer } = serializeAll(frames);
    return this.awaitBlob({ type: "encode-zip", id: this.nextId++, frames: ser, baseName }, transfer);
  }

  encodeGif(frames: FlowField[], fps: number, sharedMax: number): Promise<Blob> {
    const { frames: ser, transfer } = serializeAll(frames);
    return this.awaitBlob(
      { type: "encode-gif", id: this.nextId++, frames: ser, fps, sharedMax },
      transfer,
    );
  }

  encodeMp4(frames: FlowField[], fps: number, sharedMax: number, codec: string): Promise<Blob> {
    const { frames: ser, transfer } = serializeAll(frames);
    return this.awaitBlob(
      { type: "encode-mp4", id: this.nextId++, frames: ser, fps, sharedMax, codec },
      transfer,
    );
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    try {
      this.worker.postMessage({ type: "dispose" });
    } catch {
      /* ignore */
    }
    this.worker.terminate();
    // Reject everything still in flight so awaiters (the job loop) unwind
    // instead of hanging forever now that the worker is gone.
    const err = new CancelledError();
    this.readyReject?.(err);
    this.readyReject = this.readyResolve = null;
    for (const { reject } of this.pendingFlow.values()) reject(err);
    this.pendingFlow.clear();
    this.errored?.(err);
    this.errored = null;
    this.pendingBlob = null;
  }
}
