#!/usr/bin/env python3
"""
Produce, verify and install the RAFT ONNX models behind the viewer's flow-gen
"Balanced" (raft-small) and "Best" (raft-large) tiers.

Sources:
  * raft-large — OpenCV model zoo `optical_flow_estimation_raft` fp32
    (`..._2023aug.onnx`), mirrored on HuggingFace, shipped verbatim. (Its shipped
    block-quantized int8 is ignored — onnxruntime-web's wasm EP can't run it.)
  * raft-small — exported here from torchvision's `raft_small` (C_T_V2 weights) to
    ONNX opset 16, single full-res output, iteration count baked. ~1M params →
    a much smaller/faster neural tier than large.

Everything is verified against ground truth before committing:
  * Output selection — large emits BOTH a 1/8-res and a full-res flow; we pick
    the full-res tensor by spatial size (never by index). small emits one.
  * Pixel range — determined *empirically* by running a known-shift image pair
    through both candidate normalizations ([0,255] raw vs [-1,1] signed) and
    keeping whichever recovers the known displacement (lowest EPE).

Prints a RECONCILE block telling the runtime code (raft.ts) exactly which pixel
range and output tensor to use. Commits nothing that fails the shift test.

Tier -> file:
  Best     (raft-large) <- OpenCV zoo fp32       -> raft-large-360x480.onnx
  Balanced (raft-small) <- torchvision fp32 (ours) -> raft-small-360x480.onnx

The runtime registry that decides which of these the viewer actually offers is
viewer/src/flowgen/models.ts (RAFT_MODELS): add a registry entry (id/file/
inputW/H/pixelRange, matching the RECONCILE block) to surface a model, and keep
this script's filename(s) in sync with it. Each new resolution is a new filename,
which doubles as a Cache Storage cache-buster.

IMPORTANT: raft-small uses ONNX GridSample. It passes desktop-CPU ORT here, but
that is NOT proof it runs on onnxruntime-web's wasm EP — verify in a browser
before trusting the tier (same lesson as the removed int8 model).
"""

from __future__ import annotations

import argparse
import json
import shutil
import sys
import tempfile
import traceback
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


def build_raft_small(out_dir: Path) -> Path | None:
    """Export torchvision's raft_small to ONNX at (H,W), NCHW, two image inputs,
    a single full-res [1,2,H,W] flow output (the final refinement iteration).

    Returns the .onnx path, or None if torch/torchvision isn't installed (a local
    run without the heavy deps) — the caller still ships raft-large in that case.
    Raises on an actual export failure so the CI job surfaces it.

    Notes:
      * raft_small's forward returns a list of per-iteration flows (all upsampled
        to full res); we take the last one. Iteration count is BAKED (unrolled) —
        exactly like the zoo's raft-large — so there's no runtime iters knob.
      * grid_sample -> ONNX GridSample needs opset >= 16. onnxruntime-web's wasm
        EP has a CPU GridSample kernel, so this runs in-browser (verify there!).
      * Inputs are named '0','1' to mirror raft-large; raft.ts feeds by index and
        picks the output by shape, so exact names/opset don't matter to it.
    """
    try:
        import torch
        from torchvision.models.optical_flow import Raft_Small_Weights, raft_small
    except Exception as e:  # noqa: BLE001
        print(f"\n[skip raft-small] torch/torchvision not available: {e}")
        return None

    print("\n--- exporting torchvision raft_small -> ONNX ---")
    model = raft_small(weights=Raft_Small_Weights.C_T_V2, progress=False).eval()

    class LastFlow(torch.nn.Module):
        def __init__(self, m: torch.nn.Module) -> None:
            super().__init__()
            self.m = m

        def forward(self, a: "torch.Tensor", b: "torch.Tensor") -> "torch.Tensor":
            return self.m(a, b, num_flow_updates=12)[-1]  # final full-res flow

    wrapped = LastFlow(model).eval()
    # Random (not zero) sample input — values don't affect the traced graph, but
    # avoid any degenerate all-zero paths during tracing.
    a = torch.rand(1, 3, H, W, dtype=torch.float32)
    b = torch.rand(1, 3, H, W, dtype=torch.float32)
    dst = out_dir / "raft-small-360x480.onnx"
    with torch.no_grad():
        torch.onnx.export(
            wrapped,
            (a, b),
            str(dst),
            input_names=["0", "1"],
            output_names=["flow"],
            opset_version=16,
            do_constant_folding=True,
        )
    print(f"  exported -> {dst}  ({dst.stat().st_size / 1e6:.1f} MB)")
    return dst


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

    # NOTE: we ship the zoo's fp32 large model verbatim (no int8 — quantizing
    # this RAFT yields ConvInteger/block-quant ops the wasm EP can't run; see
    # models/README.md), PLUS a torchvision-exported raft_small for a lighter,
    # faster "Balanced" neural tier.
    targets = [(fp32, "raft-large-360x480.onnx", "signed?")]

    small_export_ok = True
    try:
        small = build_raft_small(Path(tempfile.mkdtemp()))
        if small is not None:
            targets.append((small, "raft-small-360x480.onnx", "signed?"))
    except Exception as e:  # noqa: BLE001
        print(f"\n[ERROR] raft-small export failed: {e}")
        traceback.print_exc()
        small_export_ok = False

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
    return 0 if (ok_all and small_export_ok) else 1


if __name__ == "__main__":
    sys.exit(main())
