# RAFT ONNX models

The neural flow-generation tiers run RAFT via onnxruntime-web. The files are
produced and verified by
[`.github/scripts/fetch_raft_models.py`](../../../.github/scripts/fetch_raft_models.py)
(run through the `Build flow-gen assets` workflow) and committed here plainly
(**no Git LFS** — Pages branch deploys don't resolve LFS pointers):

```
raft-large-360x480.onnx        # ~64 MB  fp32 — Best tier
raft-small-360x480.onnx        # ~a few MB fp32 — Balanced tier
```

Fetched at runtime by `src/flowgen/raft.ts` (`BASE_URL + "models/..."`), through
the Cache Storage layer in `src/flowgen/asset-cache.ts` so repeat runs skip the
download. The list of models the viewer offers lives in
`src/flowgen/models.ts` (`RAFT_MODELS`) — add an entry there (with the matching
`inputW/H` and `pixelRange`) to surface a new model; the filename encodes the
resolution and doubles as a cache-buster.

## No int8 tier

An int8 tier was intended and briefly shipped, but **removed**: quantizing this
RAFT (dynamically or via the zoo's block-quantized file) yields `ConvInteger` /
block-quant ops that **onnxruntime-web's wasm EP does not implement** — the model
loads on desktop ORT but fails in-browser with
`Could not find an implementation for ConvInteger(10) …`. Desktop-CPU validation
is therefore *not* representative of the wasm EP. Until a browser-runnable
quantization exists, only the fp32 model ships.

## Source & provenance

- **raft-large** = the OpenCV model zoo `optical_flow_estimation_raft` (RAFT,
  2023-aug) fp32 export `optical_flow_estimation_raft_2023aug.onnx`, mirrored on
  HuggingFace at
  [`opencv/optical_flow_estimation_raft`](https://huggingface.co/opencv/optical_flow_estimation_raft),
  shipped verbatim.
- **raft-small** = exported by the script from
  [`torchvision.models.optical_flow.raft_small`](https://pytorch.org/vision/stable/models/raft.html)
  (`Raft_Small_Weights.C_T_V2`) to ONNX opset 16 — single full-res output, 12
  iterations baked. ~1M params, so a much smaller/faster net than large.

> **wasm caveat:** raft-small emits an ONNX `GridSample` op (grid_sample in the
> correlation lookup). It passes desktop-CPU ORT in the script's shift test, but
> that is *not* proof it runs on onnxruntime-web's wasm EP. Verify in a browser
> before trusting the Balanced tier — the removed int8 model is the cautionary
> tale (green on desktop, `ConvInteger` failure in-browser).

## Signature (verified, do not assume)

| Property | Value |
|---|---|
| Inputs | **two** — names `'0'`, `'1'`, each `float32 [1,3,360,480]` (NCHW) |
| Outputs | **two** — a 1/8-res `[1,2,45,60]` and the full-res `[1,2,360,480]` |
| Output to use | the **full-res** one — `raft.ts` picks it by shape, never by index |
| Pixel range | **`signed`** = `2*(x/255) − 1`, i.e. `[-1,1]` (both files) |
| Opset | 11 (no `GridSample`; runs on onnxruntime-web wasm) |

The pixel range is not guessed: the script runs a known-shift image pair through
both `[0,255]` and `[-1,1]` normalizations and keeps whichever recovers the
displacement. Both models scored **0.04 px EPE** on a 12×6 px translation — i.e.
the preprocessing in `raft.ts` (`pixelRange: "signed"`) is correct.

## Notes

- Iteration count is baked into the export (RAFT's update loop is unrolled);
  changing it means re-exporting upstream.
- The int8 model is only ~24 % smaller than fp32 (RAFT has many non-quantizable
  ops). If download size matters more than the marginal saving, an fp16 export
  (~32 MB) is a candidate — but validate it on the **wasm** EP, not just CPU,
  since onnxruntime-web's fp16 op coverage differs from desktop.
