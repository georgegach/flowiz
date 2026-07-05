/**
 * Fastest tier: DIS optical flow via a vendored slim opencv.js build
 * (core+imgproc+video, DISOpticalFlow whitelisted). Runs inside the worker.
 * opencv.js has no types, so `cv` is treated as `any`; Mat lifecycle is managed
 * by hand — every Mat is reused across pairs and deleted on dispose.
 *
 * The build must be produced with MODULARIZE=1 EXPORT_ES6=1 (see
 * public/vendor/opencv/README.md) so this ES import resolves to a factory.
 */

import type { DisPreset, ProgressFn, RGBAFrame, SerializedFlow } from "./types";
import { fetchWithProgress } from "./fetch-progress";

/* eslint-disable @typescript-eslint/no-explicit-any */
type CV = any;

export interface DisEngine {
  compute(a: RGBAFrame, b: RGBAFrame): SerializedFlow;
  dispose(): void;
}

export async function createDis(
  baseUrl: string,
  preset: DisPreset,
  onProgress?: ProgressFn,
): Promise<DisEngine> {
  const jsUrl = baseUrl + "vendor/opencv/opencv-dis.js";
  const wasmUrl = baseUrl + "vendor/opencv/opencv-dis.wasm";

  // Prefetch the wasm ourselves so we can report download progress, then hand
  // the bytes to the emscripten factory via `wasmBinary`.
  onProgress?.("Downloading DIS model", 0, 0, "indeterminate");
  const wasmBinary = await fetchWithProgress(wasmUrl, (loaded, total) =>
    onProgress?.("Downloading DIS model", loaded, total, "bytes"),
  );

  onProgress?.("Initializing OpenCV", 0, 0, "indeterminate");
  const factory = (await import(/* @vite-ignore */ jsUrl)).default as (opts: any) => Promise<CV>;
  const cv: CV = await factory({ wasmBinary, locateFile: () => wasmUrl });

  // DISOpticalFlow::create returns a Ptr<>, which the opencv.js bindings expose
  // as an embind CONSTRUCTOR (not a static .create). Preset enum: ULTRAFAST=0,
  // FAST=1, MEDIUM=2 (video/tracking.hpp).
  const presetConst = preset === "ultrafast" ? 0 : preset === "medium" ? 2 : 1;
  const dis = new cv.DISOpticalFlow(presetConst);

  // Reused scratch Mats.
  let rgba: any = null;
  let gray0: any = null;
  let gray1: any = null;
  let flowMat: any = null;

  const toGray = (frame: RGBAFrame, dst: any) => {
    if (!rgba || rgba.rows !== frame.height || rgba.cols !== frame.width) {
      rgba?.delete();
      rgba = new cv.Mat(frame.height, frame.width, cv.CV_8UC4);
    }
    rgba.data.set(new Uint8Array(frame.data));
    cv.cvtColor(rgba, dst, cv.COLOR_RGBA2GRAY);
  };

  return {
    compute(a: RGBAFrame, b: RGBAFrame): SerializedFlow {
      const w = a.width;
      const h = a.height;
      if (!gray0) {
        gray0 = new cv.Mat();
        gray1 = new cv.Mat();
        flowMat = new cv.Mat();
      }
      try {
        toGray(a, gray0);
        toGray(b, gray1);
        dis.calc(gray0, gray1, flowMat);
      } catch (e) {
        // opencv.js throws C++ exceptions as raw numbers (a pointer); surface a
        // readable message instead of a bare "undefined".
        if (typeof e === "number" && typeof cv.exceptionFromPtr === "function") {
          throw new Error(`OpenCV DIS failed: ${cv.exceptionFromPtr(e).msg}`);
        }
        throw typeof e === "number" ? new Error(`OpenCV DIS failed (code ${e})`) : e;
      }
      // flowMat is CV_32FC2, interleaved u,v — copy out.
      const src = flowMat.data32F as Float32Array;
      const data = new Float32Array(w * h * 2);
      data.set(src.subarray(0, data.length));
      return { width: w, height: h, data: data.buffer, name: "" };
    },
    dispose() {
      rgba?.delete();
      gray0?.delete();
      gray1?.delete();
      flowMat?.delete();
      dis?.delete?.();
    },
  };
}
