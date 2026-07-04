# RAFT ONNX models

The **Optimal** and **Best** tiers run RAFT via onnxruntime-web. Drop the two
fixed-shape (360×480) ONNX exports here:

```
raft-small-int8-360x480.onnx   # ~5 MB  — Optimal tier
raft-large-360x480.onnx        # ~6–20 MB — Best tier
```

They are fetched at runtime by `src/flowgen/raft.ts` (`BASE_URL + "models/..."`)
and must be committed plainly (<50 MB each; **no Git LFS** — Pages branch deploys
don't resolve LFS pointers). If a future model exceeds 50 MB, switch `pages.yml`
to the artifact deploy with `actions/checkout … with: { lfs: true }`.

## Sources

- **raft-small**: OpenCV model zoo `optical_flow_estimation_raft`
  (https://huggingface.co/opencv/optical_flow_estimation_raft) — fp32 + int8,
  fixed 360×480. Use the int8 block-quantized variant.
- **raft-large**: torchvision `raft_large` exported to ONNX at 360×480, or the
  fp32/fp16 variant from the same OpenCV zoo.

## CRITICAL: pixel range must match the export

`src/flowgen/raft.ts` has a per-model `pixelRange` in the `MODELS` map:

| Model | Export | pixelRange | Preprocessing |
|-------|--------|------------|---------------|
| raft-small | OpenCV zoo int8 | `raw` | pixels 0..255 as-is |
| raft-large | torchvision | `signed` | `2*x/255 - 1` |

If your actual export differs, **update `pixelRange`** or the flow will be garbage.
Input/output tensor names are read from the session at runtime
(`session.inputNames` / `outputNames`) — no need to hardcode them, but the model
must have exactly **2 image inputs** and a flow output shaped `(1, 2, 360, 480)`.

## Notes

- Iteration count is baked into the export (RAFT's update loop is unrolled).
  Fewer iterations = faster, lower quality. Re-export to change it.
- Verify ops are supported by onnxruntime-web (`GridSample` needs opset ≥ 16).
- Peak wasm memory at 360×480 is well within the 4 GB wasm32 ceiling; larger
  fixed shapes may not be.
