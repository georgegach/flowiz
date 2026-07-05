/**
 * Optimal / Best tiers: RAFT via onnxruntime-web. Fixed input shape 360×480;
 * frames are letterboxed in and the flow is un-letterboxed + rescaled back out.
 * WebGPU EP is tried first when available, always falling back to pure wasm.
 * Runs inside the worker.
 *
 * IMPORTANT: the pixel range MUST match how the .onnx was exported. torchvision
 * RAFT wants [-1,1] (2*x/255-1); the OpenCV model zoo int8 export wants raw
 * [0,255]. Set PIXEL_RANGE per model below and document it in models/README.md.
 */

import * as ort from "onnxruntime-web";
import type { ExecutionProvider, ProgressFn, RGBAFrame, SerializedFlow } from "./types";
import { planLetterbox, unletterboxFlow, type LetterboxPlan } from "./letterbox";
import { cachedFetch } from "./asset-cache";
import type { RaftModelSpec } from "./models";

export interface RaftEngine {
  compute(a: RGBAFrame, b: RGBAFrame): Promise<SerializedFlow>;
  ep: ExecutionProvider;
  dispose(): void;
}

export async function createRaft(
  baseUrl: string,
  spec: RaftModelSpec,
  ep: "auto" | ExecutionProvider,
  onProgress?: ProgressFn,
): Promise<RaftEngine> {
  ort.env.wasm.wasmPaths = baseUrl + "vendor/ort/";
  ort.env.wasm.numThreads = 1; // no COOP/COEP on GitHub Pages

  const INPUT_W = spec.inputW;
  const INPUT_H = spec.inputH;
  const modelUrl = baseUrl + "models/" + spec.file;

  onProgress?.("Downloading RAFT model", 0, 0, "indeterminate");
  const { buffer: modelBuf } = await cachedFetch(modelUrl, (loaded, total, fromCache) =>
    onProgress?.(
      fromCache ? "Loading RAFT model (cached)" : "Downloading RAFT model",
      loaded,
      total,
      "bytes",
    ),
  );
  const modelBytes = new Uint8Array(modelBuf);

  const wantGpu = ep !== "wasm" && typeof (self as any).navigator?.gpu !== "undefined";
  let session: ort.InferenceSession;
  let usedEp: ExecutionProvider = "wasm";
  try {
    onProgress?.(`Initializing session (${wantGpu ? "WebGPU" : "WASM"})`, 0, 0, "indeterminate");
    session = await ort.InferenceSession.create(modelBytes, {
      executionProviders: wantGpu ? ["webgpu", "wasm"] : ["wasm"],
    });
    usedEp = wantGpu ? "webgpu" : "wasm";
  } catch (e) {
    if (!wantGpu) throw e; // wasm already failed — nothing to fall back to
    onProgress?.("WebGPU unavailable — falling back to WASM", 0, 0, "indeterminate");
    session = await ort.InferenceSession.create(modelBytes, { executionProviders: ["wasm"] });
    usedEp = "wasm";
  }

  const inputNames = session.inputNames;
  if (inputNames.length < 2) {
    throw new Error(`RAFT model expected 2 inputs, got ${inputNames.length}.`);
  }
  // The zoo RAFT emits TWO flow outputs — a 1/8-res coarse flow and the full-res
  // one — so we can't trust outputNames[0]; pick the full-res tensor by shape
  // after each run instead.
  const pickFullRes = (out: Record<string, ort.Tensor>): ort.Tensor => {
    let best: ort.Tensor | null = null;
    let bestArea = -1;
    for (const name of session.outputNames) {
      const t = out[name];
      const d = t.dims;
      if (d.length === 4 && d[1] === 2) {
        const area = d[2] * d[3];
        if (area > bestArea) {
          best = t;
          bestArea = area;
        }
      }
    }
    if (!best) throw new Error("RAFT: no (1,2,H,W) flow output found.");
    return best;
  };

  const canvas = new OffscreenCanvas(INPUT_W, INPUT_H);
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;

  const preprocess = (frame: RGBAFrame, plan: LetterboxPlan): Float32Array => {
    ctx.fillStyle = "black";
    ctx.fillRect(0, 0, INPUT_W, INPUT_H);
    const bmpCanvas = new OffscreenCanvas(frame.width, frame.height);
    const bctx = bmpCanvas.getContext("2d")!;
    bctx.putImageData(
      new ImageData(new Uint8ClampedArray(frame.data), frame.width, frame.height),
      0,
      0,
    );
    ctx.drawImage(bmpCanvas, plan.padX, plan.padY, plan.drawW, plan.drawH);
    const img = ctx.getImageData(0, 0, INPUT_W, INPUT_H).data;
    // NCHW float32
    const chw = new Float32Array(3 * INPUT_H * INPUT_W);
    const plane = INPUT_H * INPUT_W;
    for (let i = 0; i < plane; i++) {
      for (let c = 0; c < 3; c++) {
        const v = img[i * 4 + c];
        chw[c * plane + i] = spec.pixelRange === "signed" ? (2 * v) / 255 - 1 : v;
      }
    }
    return chw;
  };

  return {
    ep: usedEp,
    async compute(a: RGBAFrame, b: RGBAFrame): Promise<SerializedFlow> {
      const plan = planLetterbox(a.width, a.height, INPUT_W, INPUT_H);
      const t0 = new ort.Tensor("float32", preprocess(a, plan), [1, 3, INPUT_H, INPUT_W]);
      const t1 = new ort.Tensor("float32", preprocess(b, plan), [1, 3, INPUT_H, INPUT_W]);
      const feeds: Record<string, ort.Tensor> = {
        [inputNames[0]]: t0,
        [inputNames[1]]: t1,
      };
      const out = await session.run(feeds);
      const planar = pickFullRes(out as unknown as Record<string, ort.Tensor>)
        .data as Float32Array; // [1,2,H,W]
      // planar CHW -> interleaved u,v
      const plane = INPUT_H * INPUT_W;
      const inter = new Float32Array(plane * 2);
      for (let i = 0; i < plane; i++) {
        inter[i * 2] = planar[i];
        inter[i * 2 + 1] = planar[plane + i];
      }
      const data = unletterboxFlow(inter, plan, INPUT_W, a.width, a.height);
      return { width: a.width, height: a.height, data: data.buffer, name: "" };
    },
    dispose() {
      session.release?.();
    },
  };
}
