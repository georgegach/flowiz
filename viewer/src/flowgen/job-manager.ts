/**
 * Background flow-generation job manager. Owns the FlowEngine and a queue of
 * videos, and streams computed frames into the viewer as they arrive — so the
 * settings dialog can close immediately and generation runs in the background.
 *
 * One job runs at a time; extra dropped videos queue. Completed frames are
 * handed to the viewer incrementally via onFrame and are never destroyed by a
 * later Cancel. The viewer owns the single copy of the flow results — this
 * manager only tracks counts.
 */

import type { FlowField } from "../flow";
import type { ExecutionProvider, GenOptions, ProgressKind } from "./types";
import { FlowEngine, CancelledError } from "./engine";
import { baseUrl } from "./base-url";
import { openVideo, type VideoFrameSource } from "../video/decode";

/** Keep at most this many source-frame snapshots (≈0.5 MB each) — long videos
 * otherwise pin gigabytes. Beyond it, frames stream without a source overlay. */
const MAX_SOURCE_SNAPSHOTS = 900;

export type JobStatus =
  | "queued"
  | "starting"
  | "decoding"
  | "running"
  | "done"
  | "stopped"
  | "cancelled"
  | "error";

export interface JobSettings {
  opts: GenOptions;
  stride: number;
  maxDim: number;
}

export interface FlowJob {
  readonly id: number;
  readonly file: File;
  readonly settings: JobSettings;
  status: JobStatus;
  ep?: ExecutionProvider;
  framesDone: number;
  framesTotal: number; // best-effort estimate (src.frameCount - 1)
  error?: string;
}

export interface JobManagerEvents {
  /** Any status/queue change — refresh the status chip. */
  onJobUpdate(active: FlowJob | null, queue: readonly FlowJob[]): void;
  onProgress(job: FlowJob, phase: string, done: number, total: number, kind: ProgressKind): void;
  /** Fired just before the first frame of a job — the viewer resets for it. */
  onStreamStart(job: FlowJob): void;
  onFrame(job: FlowJob, flow: FlowField, src: ImageBitmap | null): void;
  /** Job finished (done/stopped) with at least one frame produced. */
  onStreamEnd(job: FlowJob): void;
  notify(msg: string, kind?: "error" | "info"): void;
}

const TERMINAL: JobStatus[] = ["done", "stopped", "cancelled", "error"];

export class FlowJobManager {
  private jobs: FlowJob[] = []; // active + queued, in order
  private nextId = 1;
  private pumping = false;
  private activeJob: FlowJob | null = null;
  private engine: FlowEngine | null = null;
  private cancelRequested = false;
  private stopRequested = false;

  constructor(private events: JobManagerEvents) {}

  get active(): FlowJob | null {
    return this.activeJob;
  }

  get queue(): readonly FlowJob[] {
    return this.jobs.filter((j) => j !== this.activeJob && j.status === "queued");
  }

  enqueue(file: File, settings: JobSettings): FlowJob {
    const job: FlowJob = {
      id: this.nextId++,
      file,
      settings,
      status: "queued",
      framesDone: 0,
      framesTotal: 0,
    };
    this.jobs.push(job);
    this.emitUpdate();
    void this.pump();
    return job;
  }

  /** Graceful early stop — keeps frames already produced. */
  stop(id: number): void {
    if (this.activeJob?.id === id) {
      this.stopRequested = true;
    } else {
      this.dropQueued(id);
    }
  }

  /** Abort — terminates in-flight inference for the active job, or drops a queued one. */
  cancel(id: number): void {
    if (this.activeJob?.id === id) {
      this.cancelRequested = true;
      this.engine?.dispose(); // only way to interrupt a multi-second inference
    } else {
      this.dropQueued(id);
    }
  }

  private dropQueued(id: number): void {
    const job = this.jobs.find((j) => j.id === id && j !== this.activeJob);
    if (!job) return;
    job.status = "cancelled";
    this.jobs = this.jobs.filter((j) => j !== job);
    this.emitUpdate();
  }

  private emitUpdate(): void {
    this.events.onJobUpdate(this.activeJob, this.queue);
  }

  private async pump(): Promise<void> {
    if (this.pumping) return;
    this.pumping = true;
    try {
      for (;;) {
        const next = this.jobs.find((j) => j.status === "queued");
        if (!next) break;
        await this.runJob(next);
      }
    } finally {
      this.pumping = false;
    }
  }

  private async runJob(job: FlowJob): Promise<void> {
    this.activeJob = job;
    this.cancelRequested = false;
    this.stopRequested = false;
    job.status = "starting";
    this.emitUpdate();

    const base = baseUrl();
    const engine = new FlowEngine();
    this.engine = engine;

    // Aggregate the two concurrent progress sources (model download + video
    // decode) into one line so they don't stomp each other on the chip.
    type P = { phase: string; done: number; total: number; kind: ProgressKind };
    let modelP: P | null = null;
    let decodeP: P | null = null;
    const flush = () => {
      if (modelP && decodeP) {
        this.events.onProgress(
          job,
          `${modelP.phase} · ${decodeP.phase}`,
          modelP.done,
          modelP.total,
          modelP.kind,
        );
      } else if (modelP) {
        this.events.onProgress(job, modelP.phase, modelP.done, modelP.total, modelP.kind);
      } else if (decodeP) {
        this.events.onProgress(job, decodeP.phase, decodeP.done, decodeP.total, decodeP.kind);
      }
    };
    engine.onProgress = (phase, done, total, kind) => {
      modelP = { phase, done, total, kind };
      flush();
    };

    let src: VideoFrameSource | null = null;
    let producedAny = false;
    let streamStarted = false;

    try {
      // Kick off the model download/init in parallel with video decode. The
      // .catch shim is essential: without it, a model-download failure while
      // the decode is still awaiting fires an unhandled rejection.
      let initError: unknown = null;
      const enginePromise = engine
        .init(job.settings.opts, base)
        .catch((e) => {
          initError = e;
          return null;
        });

      job.status = "decoding";
      this.emitUpdate();
      const { stride, maxDim } = job.settings;
      try {
        // Loaded lazily so the (rarely used) ffmpeg.wasm glue stays out of the
        // main entry chunk — flow files and the sample flows never need it.
        const { openVideoFFmpeg } = await import("../video/ffmpeg-decode");
        src = await openVideoFFmpeg(
          job.file,
          { stride, maxDim },
          (phase, done, total, kind) => {
            decodeP = { phase, done, total, kind };
            flush();
          },
          base,
        );
      } catch (ffErr) {
        this.events.notify("ffmpeg unavailable — using the browser decoder.", "info");
        console.warn("ffmpeg decode failed, falling back to <video>:", ffErr);
        src = await openVideo(job.file, { stride, maxDim });
      }

      const ep = await enginePromise;
      if (initError) throw initError;
      if (this.cancelRequested) return; // fall through to finally cleanup
      if (!src) throw new Error("Video decode produced no source.");
      job.ep = ep ?? undefined;

      job.status = "running";
      job.framesTotal = Math.max(1, src.frameCount - 1);
      this.emitUpdate();

      const stem = job.file.name.replace(/\.[^.]+$/, "");
      let i = 0;
      // Drive the frame iterator manually so we can start decoding frame N+1
      // (on the main thread) while frame N's inference runs in the worker —
      // one frame of prefetch overlaps decode latency with compute. Ordering is
      // preserved, so the worker's prev-frame cache stays correct.
      const it = src.frames()[Symbol.asyncIterator]();
      let nextP = it.next();
      try {
        for (;;) {
          const res = await nextP;
          if (res.done) break;
          if (this.cancelRequested || this.stopRequested) break;
          const frame = res.value;
          nextP = it.next(); // begin decoding the next frame during this inference

          // Snapshot BEFORE pushFrame transfers frame.data (detached buffers read
          // as silent zero-length). Cap snapshots so long videos don't blow memory.
          const wantSnap = job.framesDone < MAX_SOURCE_SNAPSHOTS;
          const snap = wantSnap
            ? createImageBitmap(
                new ImageData(new Uint8ClampedArray(frame.data.slice(0)), frame.width, frame.height),
              ).catch(() => null)
            : Promise.resolve<ImageBitmap | null>(null);

          let flow: FlowField | null;
          try {
            flow = await engine.pushFrame(frame, i++);
          } catch (e) {
            if (e instanceof CancelledError) break;
            throw e;
          }
          if (flow) {
            if (!streamStarted) {
              this.events.onStreamStart(job);
              streamStarted = true;
            }
            flow.name = `${stem}_${String(job.framesDone + 1).padStart(4, "0")}.flo`;
            job.framesDone++;
            producedAny = true;
            this.events.onFrame(job, flow, await snap);
            this.events.onProgress(
              job,
              `Computing flow ${job.framesDone} / ${job.framesTotal}`,
              job.framesDone,
              job.framesTotal,
              "count",
            );
            this.emitUpdate();
          } else {
            (await snap)?.close();
          }
        }
      } finally {
        // Swallow the abandoned prefetch so an early break can't raise an
        // unhandled rejection once the source is closed.
        void nextP.catch(() => {});
      }

      // Terminal status.
      if (this.cancelRequested) {
        job.status = "cancelled";
      } else if (this.stopRequested) {
        job.status = "stopped";
        if (producedAny)
          this.events.notify(
            `Stopped — ${job.framesDone} frame${job.framesDone > 1 ? "s" : ""} generated.`,
            "info",
          );
      } else if (producedAny) {
        job.status = "done";
      } else {
        job.status = "error";
        job.error = "No flow frames were produced (video too short for this stride?).";
        this.events.notify(job.error);
      }
      if (producedAny) this.events.onStreamEnd(job);
    } catch (err) {
      if (this.cancelRequested) {
        job.status = "cancelled";
      } else {
        job.status = "error";
        job.error = (err as Error)?.message || String(err) || "Generation failed.";
        this.events.notify(job.error);
      }
    } finally {
      try {
        src?.close();
      } catch {
        /* ignore */
      }
      engine.dispose();
      this.engine = null;
      this.activeJob = null;
      // Drop the finished job from the list; next pump() picks up any queued job.
      if (TERMINAL.includes(job.status)) this.jobs = this.jobs.filter((j) => j !== job);
      this.emitUpdate();
    }
  }
}
