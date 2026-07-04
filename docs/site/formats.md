# Formats

`fz.read(path)` dispatches on extension, then magic bytes.

| Format | Extension | Read | Write | Notes |
|---|---|:---:|:---:|---|
| Middlebury | `.flo` | ✅ | ✅ | The classic float tag `202021.25` |
| KITTI | `.png` | ✅ | ✅ | 16-bit RGB; `flow = (v − 2¹⁵)/64`, channel 3 = valid mask |
| PFM | `.pfm` | ✅ | — | Sintel / FlyingThings; 3rd channel treated as validity |
| NumPy | `.npy`, `.npz` | ✅ | ✅ (`.npy`) | `(H,W,2)` or `(2,H,W)` auto-detected |
| Spring | `.flo5`, `.h5` | ✅ | — | HDF5-backed; needs `flowiz[spring]` |
| PyTorch | (tensor) | ✅ | — | `fz.from_tensor`; batched → `list[Flow]` |

## Reading

```python
fz.read("kitti/000000_10.png")     # KITTI, carries a validity mask
fz.read("sintel/frame_0001.pfm")   # PFM
fz.read("dump.npy")                # numpy array on disk
fz.read(numpy_array)               # in-memory (H,W,2) or (2,H,W)
```

## Writing

```python
fz.write(flow, "out.flo")   # Middlebury
fz.write(flow, "out.png")   # KITTI 16-bit
fz.write(flow, "out.npy")   # numpy
```

## Validity masks

KITTI and PFM carry per-pixel validity. It rides along on `flow.valid` and is
honored by `colorize(..., mask_invalid=True)` (invalid pixels drawn black) and by
all metrics (statistics computed over valid pixels only).
