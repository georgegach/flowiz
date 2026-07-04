<p align="center">
<img src="https://raw.githubusercontent.com/georgegach/flowiz/master/docs/assets/flowiz-logo.png" width="380" alt="flowiz" style="margin:40px">
</p>

<p align="center"><strong>The optical flow visualization toolkit.</strong><br>
Read any flow format · render publication-quality color maps · compute error maps · compile videos · or just drag-drop into the browser viewer.</p>

<p align="center">
<a href="https://pypi.org/project/flowiz/"><img src="https://img.shields.io/pypi/v/flowiz.svg" alt="PyPI"></a>
<a href="https://pypi.org/project/flowiz/"><img src="https://img.shields.io/pypi/pyversions/flowiz.svg" alt="Python versions"></a>
<a href="https://pypistats.org/packages/flowiz"><img src="https://img.shields.io/pypi/dm/flowiz.svg" alt="Downloads"></a>
<a href="https://github.com/georgegach/flowiz/blob/master/LICENSE"><img src="https://img.shields.io/pypi/l/flowiz.svg" alt="License"></a>
<a href="https://georgegach.github.io/flowiz/"><img src="https://img.shields.io/badge/browser-viewer-5b9dff" alt="Viewer"></a>
</p>

<p align="center">
🌀 <strong><a href="https://georgegach.github.io/flowiz/">Try the browser viewer</a></strong> —
no install, no upload, works offline · 📚 <a href="https://georgegach.github.io/flowiz/docs/">Docs</a>
</p>

---

## Why flowiz

Optical flow research moved on — RAFT, GMFlow, FlowFormer, SEA-RAFT — but everyone still hand-rolls the same Baker/Middlebury color wheel and juggles `.flo`, KITTI PNGs, `.pfm`, `.npy` and raw tensors. flowiz is the one dependency that reads them all and renders them consistently.

| | flowiz | `flow_vis` | `mmcv.flow2rgb` | hand-rolled |
|---|:---:|:---:|:---:|:---:|
| `.flo` / KITTI / `.pfm` / `.npy` readers | ✅ | ❌ | ❌ | ❌ |
| Torch tensor input | ✅ | ❌ | ❌ | ❌ |
| Bit-compatible Middlebury wheel | ✅ | ✅ | ~ | ~ |
| Temporally consistent video | ✅ | ❌ | ❌ | ❌ |
| EPE / Fl error maps & compare grids | ✅ | ❌ | ❌ | ❌ |
| Vector overlays & legends | ✅ | ❌ | ❌ | ❌ |
| Browser viewer | ✅ | ❌ | ❌ | ❌ |

## Install

```bash
pip install flowiz -U        # batteries included: video, CLI, plotting
pip install flowiz[torch]    # + torch tensor helpers
pip install flowiz[spring]   # + Spring .flo5 (HDF5) reading
```

## Quick start

```python
import flowiz as fz

flow = fz.read("frame_0001.flo")     # .flo, KITTI .png, .pfm, .npy, tensors — auto-detected
img  = fz.colorize(flow)             # (H, W, 3) uint8 RGB, Middlebury color wheel

# straight from a model
pred = fz.from_tensor(model(x))      # torch tensor -> Flow
fz.compare_grid(pred, gt, save="figure.png")   # pred | ground truth | EPE — a paper figure in one call
```

![Example](https://raw.githubusercontent.com/georgegach/flowiz/master/demo/png/frame_0001.flo.png)

## Command line

```bash
flowiz convert 'flows/*.flo' -o out/ --workers 8      # batch -> PNGs
flowiz video   'flows/*.flo' -o flow.mp4 -r 24        # flicker-free video (shared normalizer)
flowiz info    frame_0001.flo                         # header + magnitude stats
flowiz compare pred.flo gt.flo --save grid.png        # EPE / Fl-score
flowiz view                                           # open the offline browser viewer
```

## Browser viewer

Drag a flow file onto **[georgegach.github.io/flowiz](https://georgegach.github.io/flowiz/)** and inspect it per-pixel — u, v, magnitude and angle on hover, WebGL2 rendering, adjustable normalization, PNG export. Everything runs client-side; your files never leave the machine.

## Documentation

- [Getting started & API reference](https://georgegach.github.io/flowiz/docs/)
- [Supported formats](https://georgegach.github.io/flowiz/docs/formats/)
- [flowiz for papers](https://georgegach.github.io/flowiz/docs/papers/)
- Examples: [`examples/`](examples/) — KITTI ground truth, RAFT output, error maps, videos

## Citing flowiz

If flowiz helped your research or figures, a citation is appreciated (it's requested, not required — the MIT license asks nothing):

```bibtex
@software{gach_flowiz,
  author  = {George Gach},
  title   = {flowiz: the optical flow visualization toolkit},
  url      = {https://github.com/georgegach/flowiz},
  version = {3.0.0},
  year    = {2026}
}
```

See [`CITATION.cff`](CITATION.cff). Upgrading from v2? See [`MIGRATION.md`](MIGRATION.md).

## Acknowledgements

Based on the Middlebury Vision Project color coding — original credits to Daniel Scharstein (C++) and Deqing Sun (MATLAB): <http://vision.middlebury.edu/flow/>.

## License

MIT © George Gach
