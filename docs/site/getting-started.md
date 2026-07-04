# Getting started

## Install

```bash
pip install flowiz -U        # core + video + CLI + plotting
pip install flowiz[torch]    # torch tensor helpers
pip install flowiz[spring]   # Spring .flo5 (HDF5)
```

## Read → colorize → save

```python
import flowiz as fz

flow = fz.read("frame_0001.flo")   # Flow object
img  = fz.colorize(flow)           # (H, W, 3) uint8 RGB

from PIL import Image
Image.fromarray(img).save("frame_0001.png")
```

`fz.read` auto-detects the format from the extension and magic bytes, so the
same call works for KITTI PNGs, PFM, `.npy`, and Spring `.flo5`.

## From a model

```python
pred = fz.from_tensor(model(images))   # torch (2,H,W)/(N,2,H,W) -> Flow / list[Flow]
img  = fz.colorize(pred)
```

## The `Flow` object

```python
flow.data        # (H, W, 2) float32
flow.u, flow.v   # channels
flow.magnitude   # per-pixel sqrt(u^2 + v^2)
flow.angle       # per-pixel direction (radians)
flow.valid       # (H, W) bool mask or None
flow.max_magnitude()
```

Inputs are always copied — flowiz never mutates your array.
