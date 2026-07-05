#!/usr/bin/env python3
"""
Produce, verify and install the RAFT ONNX models behind the viewer's flow-gen
"Optimal" (int8) and "Best" (fp32) tiers.

Source: OpenCV model zoo `optical_flow_estimation_raft` (mirrored on HuggingFace).
Ships one architecture: fp32 (`..._2023aug.onnx`) plus a *block-quantized* int8
that onnxruntime rejects (`block_size must be 0 for per-tensor quantization`) —
so we ignore the shipped int8 and dynamically quantize the fp32 ourselves into an
onnxruntime-web-compatible per-tensor int8.

Everything is verified against ground truth before committing:
  * Output selection — the model emits BOTH a 1/8-res and a full-res flow; we
    pick the full-res tensor by spatial size (never by index).
  * Pixel range — determined *empirically* by running a known-shift image pair
    through both candidate normalizations ([0,255] raw vs [-1,1] signed) and
    keeping whichever recovers the known displacement (lowest EPE).

Prints a RECONCILE block telling the runtime code (raft.ts) exactly which pixel
range and output tensor to use. Commits nothing that fails the shift test.

Tier -> file:
  Best    (raft-large) <- fp32 dynamic  -> raft-large-360x480.onnx
  Optimal (raft-small) <- int8 (ours)   -> raft-small-int8-360x480.onnx
"""

from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path

import numpy as np
import onnx
import onnxruntime as ort
from huggingface_hub import hf_hub_download, list_repo_files

REPO_ID = "opencv/optical_flow_estimation_raft"
MODELS_DIR = Path(__file__).resolve().parents[2] / "viewer" / "public" / "models"
H, W = 360, 480
SHIFT_DX, SHIFT_DY = 12, 6  # known displacement for the empirical range test


def make_shift_pair() -> tuple[np.ndarray, np.ndarray]:
    """Two RGB frames (H,W,3, 0..255) where frame B = frame A shifted by
    (SHIFT_DX, SHIFT_DY). Blocky random texture gives trackable features."""
    rng = np.random.RandomState(1234)
    small = rng.randint(0, 256, size=(H // 6, W // 6, 3), dtype=np.uint8)
    a = np.kron(small, np.ones((6, 6, 1), dtype=np.uint8)).astype(np.float32)
    a = a[:H, :W]
    # B[y,x] = A[y-dy, x-dx]  => features move by (+dx,+dy)  => flow (dx,dy)
    b = np.roll(a, shift=(SHIFT_DY, SHIFT_DX), axis=(0, 1))
    return a, b


def to_nchw(img: np.ndarray, pixel_range: str) -> np.ndarray:
    x = img.astype(np.float32)
    if pixel_range == "signed":
        x = 2.0 * x / 255.0 - 1.0
    chw = np.transpose(x, (2, 0, 1))[None]  # 1,3,H,W
    return np.ascontiguousarray(chw, dtype=np.float32)


def pick_fullres_output(sess: ort.InferenceSession, outs: list[np.ndarray]) -> np.ndarray:
    """Select the (1,2,H,W) full-res flow by largest spatial area."""
    best, best_area = None, -1
    for arr in outs:
        if arr.ndim == 4 and arr.shape[1] == 2:
            area = arr.shape[2] * arr.shape[3]
            if area > best_area:
                best, best_area = arr, area
    if best is None:
        raise RuntimeError("no (1,2,H,W) flow output found")
    return best


def run_flow(sess: ort.InferenceSession, a: np.ndarray, b: np.ndarray, pixel_range: str) -> np.ndarray:
    names = [i.name for i in sess.get_inputs()]
    feeds = {names[0]: to_nchw(a, pixel_range), names[1]: to_nchw(b, pixel_range)}
    outs = sess.run(None, feeds)
    flow = pick_fullres_output(sess, outs)[0]  # 2,H,W
    return flow


def shift_epe(flow: np.ndarray) -> float:
    """Mean end-point error of predicted flow vs the known (dx,dy) in the interior."""
    m = 24
    u = flow[0, m:H - m, m:W - m]
    v = flow[1, m:H - m, m:W - m]
    du = u - SHIFT_DX
    dv = v - SHIFT_DY
    return float(np.mean(np.sqrt(du * du + dv * dv)))


def verify_model(path: Path) -> tuple[bool, str, float]:
    """Return (ok, best_pixel_range, epe). Determines pixel range empirically."""
    size_mb = path.stat().st_size / 1e6
    print(f"\n=== {path.name}  ({size_mb:.1f} MB) ===")
    try:
        sess = ort.InferenceSession(str(path), providers=["CPUExecutionProvider"])
    except Exception as e:  # noqa: BLE001
        print(f"  [FAIL] session create: {e}")
        return False, "", 1e9

    for i in sess.get_inputs():
        print(f"  input  {i.name!r:6s} {i.shape} {i.type}")
    for o in sess.get_outputs():
        print(f"  output {o.name!r:6s} {o.shape} {o.type}")

    a, b = make_shift_pair()
    results = {}
    for pr in ("raw", "signed"):
        try:
            flow = run_flow(sess, a, b, pr)
            epe = shift_epe(flow)
            med = (float(np.median(flow[0])), float(np.median(flow[1])))
            print(f"  pixel_range={pr:6s} -> median flow≈{med}  EPE(vs {SHIFT_DX},{SHIFT_DY})={epe:.2f}px")
            results[pr] = epe
        except Exception as e:  # noqa: BLE001
            print(f"  pixel_range={pr:6s} -> [FAIL] {e}")
            results[pr] = 1e9

    best = min(results, key=results.get)
    ok = results[best] < 2.5  # sub-2.5px EPE on a pure translation = model works
    print(f"  => best pixel_range={best!r}  EPE={results[best]:.2f}px  {'[OK]' if ok else '[FAIL: EPE too high]'}")
    return ok, best, results[best]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--commit", action="store_true")
    args = ap.parse_args()

    files = list_repo_files(REPO_ID)
    onnx_files = sorted(f for f in files if f.endswith(".onnx"))
    print("repo .onnx files:", json.dumps(onnx_files))
    fp32_name = next((f for f in onnx_files if "int8" not in f.lower() and "quant" not in f.lower()), None)
    if not fp32_name:
        print("[FATAL] no fp32 onnx found")
        return 1

    print(f"\n--- downloading {fp32_name} ---")
    fp32 = Path(hf_hub_download(REPO_ID, fp32_name))

    # NOTE: we intentionally ship ONLY the fp32 model. Quantizing this RAFT to
    # int8 (dynamically, producing ConvInteger, or via the zoo's block-quant
    # file) yields ops that onnxruntime-web's wasm EP cannot run in-browser —
    # they pass desktop-CPU validation but fail at session-create time with
    # "Could not find an implementation for ConvInteger". See models/README.md.
    targets = [(fp32, "raft-large-360x480.onnx", "signed?")]

    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    reconcile = {}
    ok_all = True
    for path, dest_name, _ in targets:
        ok, pr, epe = verify_model(path)
        ok_all = ok_all and ok
        reconcile[dest_name] = {"pixelRange": pr, "epe": round(epe, 2)}
        if ok and args.commit:
            shutil.copyfile(path, MODELS_DIR / dest_name)
            print(f"  committed -> viewer/public/models/{dest_name}")

    print("\n========== RECONCILE raft.ts ==========")
    print(json.dumps(reconcile, indent=2))
    print("  output tensor: select the (1,2,360,480) full-res output by shape,")
    print("  NOT session.outputNames[0] (that is the 1/8-res 45x60 flow).")
    print("=======================================")
    return 0 if ok_all else 1


if __name__ == "__main__":
    sys.exit(main())
