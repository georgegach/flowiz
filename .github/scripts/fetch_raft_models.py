#!/usr/bin/env python3
"""
Fetch, introspect and validate the RAFT ONNX models that back the viewer's
"Optimal" and "Best" flow-generation tiers, then place them under
viewer/public/models/ with the exact filenames viewer/src/flowgen/raft.ts expects.

Source: the OpenCV model zoo `optical_flow_estimation_raft`, mirrored on
HuggingFace, which ships purpose-built ONNX (fp32 + int8) that runs under
onnxruntime — this avoids the fragility of exporting RAFT from torchvision
(convex-upsampling `unfold` etc. trip the ONNX exporter).

Tier -> file mapping (same architecture, different quantization):
  Optimal (raft-small) <- int8 variant  -> raft-small-int8-360x480.onnx
  Best    (raft-large) <- fp32 variant  -> raft-large-360x480.onnx

The script is deliberately loud: it prints the real input/output signature of
each model so the runtime code (INPUT_W/H, input count, pixel range) can be
reconciled against ground truth. It NEVER commits a model that fails a CPU
inference smoke test.
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


def introspect(path: Path) -> dict:
    """Print and return the model's I/O signature."""
    model = onnx.load(str(path))
    onnx.checker.check_model(model)

    def shape_of(vi) -> list:
        dims = []
        for d in vi.type.tensor_type.shape.dim:
            dims.append(d.dim_value if d.HasField("dim_value") else (d.dim_param or "?"))
        return dims

    inputs = [(i.name, shape_of(i)) for i in model.graph.input]
    outputs = [(o.name, shape_of(o)) for o in model.graph.output]
    size_mb = path.stat().st_size / 1e6

    print(f"\n=== {path.name}  ({size_mb:.1f} MB) ===")
    print("  inputs:")
    for name, shp in inputs:
        print(f"    {name!r:40s} {shp}")
    print("  outputs:")
    for name, shp in outputs:
        print(f"    {name!r:40s} {shp}")
    ir = model.opset_import
    print("  opsets:", {op.domain or "ai.onnx": op.version for op in ir})
    return {"inputs": inputs, "outputs": outputs, "path": path}


def smoke_test(path: Path, sig: dict) -> bool:
    """Run one CPU inference with concrete-shaped random inputs."""
    try:
        sess = ort.InferenceSession(str(path), providers=["CPUExecutionProvider"])
    except Exception as e:  # noqa: BLE001
        print(f"  [FAIL] could not create ORT session: {e}")
        return False

    feeds = {}
    for inp in sess.get_inputs():
        # Replace symbolic/zero dims with the design-time shape.
        # RAFT here is expected at 360x480 (H x W), NCHW, 3-channel.
        raw = [d if isinstance(d, int) and d > 0 else None for d in inp.shape]
        concrete = []
        for i, d in enumerate(raw):
            if d is not None:
                concrete.append(d)
            else:
                # Fill unknown dims from the RAFT design shape by position.
                concrete.append([1, 3, 360, 480][i] if i < 4 else 1)
        dtype = np.float32 if "float" in inp.type else np.uint8
        feeds[inp.name] = (np.random.rand(*concrete).astype(np.float32) * 255).astype(dtype)
        print(f"  feed {inp.name!r} shape={concrete} dtype={dtype.__name__}")

    try:
        outs = sess.run(None, feeds)
    except Exception as e:  # noqa: BLE001
        print(f"  [FAIL] inference raised: {e}")
        return False

    for o, arr in zip(sess.get_outputs(), outs):
        print(f"  out {o.name!r} -> shape={arr.shape} dtype={arr.dtype} "
              f"range=[{arr.min():.3f}, {arr.max():.3f}]")
    print("  [OK] inference succeeded")
    return True


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--commit", action="store_true",
                    help="copy validated models into viewer/public/models/")
    args = ap.parse_args()

    print("Listing repo files:", REPO_ID)
    try:
        files = list_repo_files(REPO_ID)
    except Exception as e:  # noqa: BLE001
        print(f"[FATAL] could not list {REPO_ID}: {e}")
        return 1
    onnx_files = sorted(f for f in files if f.endswith(".onnx"))
    print(json.dumps(onnx_files, indent=2))
    if not onnx_files:
        print("[FATAL] no .onnx files in repo")
        return 1

    # Classify: int8/quant -> small tier, otherwise fp32 -> large tier.
    def is_int8(name: str) -> bool:
        n = name.lower()
        return "int8" in n or "quant" in n or "_bq" in n

    int8 = [f for f in onnx_files if is_int8(f)]
    fp32 = [f for f in onnx_files if not is_int8(f)]
    print("\nint8 candidates:", int8)
    print("fp32 candidates:", fp32)

    targets = []  # (hf_file, dest_name)
    if fp32:
        targets.append((fp32[0], "raft-large-360x480.onnx"))
    if int8:
        targets.append((int8[0], "raft-small-int8-360x480.onnx"))
    elif fp32:
        # Fall back: use fp32 for both tiers if no int8 exists.
        targets.append((fp32[0], "raft-small-int8-360x480.onnx"))

    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    ok_all = True
    for hf_file, dest_name in targets:
        print(f"\n--- downloading {hf_file} ---")
        local = Path(hf_hub_download(REPO_ID, hf_file))
        sig = introspect(local)
        passed = smoke_test(local, sig)
        ok_all = ok_all and passed
        if passed and args.commit:
            dest = MODELS_DIR / dest_name
            shutil.copyfile(local, dest)
            print(f"  committed -> {dest.relative_to(MODELS_DIR.parents[2])}")

    return 0 if ok_all else 1


if __name__ == "__main__":
    sys.exit(main())
