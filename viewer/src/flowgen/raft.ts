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
import type { ExecutionProvider, RGBAFrame, SerializedFlow } from "./types";
import { planLetterbox, unletterboxFlow, type LetterboxPlan } from "./letterbox";

const INPUT_W = 480;
const INPUT_H = 360;

interface ModelSpec {
  file: string;
  pixelRange: "signed" | "raw"; // signed = 2*x/255-1 ; raw = x (0..255)
}

const MODELS: Record<"raft-small" | "raft-large", ModelSpec> = {
  // raft-small: OpenCV model-zoo int8 export → raw [0,255].
  "raft-small": { file: "raft-small-int8-360x480.onnx", pixelRange: "raw" },
  // raft-large: torchvision export → normalized [-1,1].
  "raft-large": { file: "raft-large-360x480.onnx", pixelRange: "signed" },
};

export interface RaftEngine {
  compute(a: RGBAFrame, b: RGBAFrame): Promise<SerializedFlow>;
  ep: ExecutionProvider;
  dispose(): void;
}

export async function createRaft(
  baseUrl: string,
  tier: "raft-small" | "raft-large",
  ep: "auto" | ExecutionProvider,
): Promise<RaftEngine> {
  ort.env.wasm.wasmPaths = baseUrl + "vendor/ort/";
  ort.env.wasm.numThreads = 1; // no COOP/COEP on GitHub Pages

  const spec = MODELS[tier];
  const modelUrl = baseUrl + "models/" + spec.file;

  const wantGpu = ep !== "wasm" && typeof (self as any).navigator?.gpu !== "undefined";
  let session: ort.InferenceSession;
  let usedEp: ExecutionProvider = "wasm";
  try {
    session = await ort.InferenceSession.create(modelUrl, {
      executionProviders: wantGpu ? ["webgpu", "wasm"] : ["wasm"],
    });
    usedEp = wantGpu ? "webgpu" : "wasm";
  } catch {
    session = await ort.InferenceSession.create(modelUrl, { executionProviders: ["wasm"] });
    usedEp = "wasm";
  }

  const inputNames = session.inputNames;
  const outputName = session.outputNames[0];
  if (inputNames.length < 2) {
    throw new Error(`RAFT model expected 2 inputs, got ${inputNames.length}.`);
  }

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
      const planar = out[outputName].data as Float32Array; // [1,2,H,W]
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
