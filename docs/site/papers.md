# flowiz for papers

flowiz is built to make optical-flow figures reproducible and consistent with
prior work.

## Match the literature

The color wheel is bit-compatible with `flow_vis`, the de-facto standard used by
RAFT and successors. Your visualizations line up with published figures without
tuning.

## One-call comparison figures

```python
import flowiz as fz

pred = fz.from_tensor(model(images))
gt   = fz.read("sintel/flow/frame_0001.flo")
fz.compare_grid(pred, gt, save="fig3_sintel.png")
```

## Consistent qualitative videos

```python
flowiz video 'results/*.flo' -o supp/qualitative.mp4 -r 24
```

Sequence-wide normalization keeps colors stable across frames so reviewers see
motion, not flicker.

## Citing flowiz

A citation is appreciated (requested, not license-required):

```bibtex
@software{gach_flowiz,
  author  = {Giorgi Gachechiladze},
  title   = {flowiz: the optical flow visualization toolkit},
  url      = {https://github.com/georgegach/flowiz},
  version = {3.0.0},
  year    = {2026}
}
```

The machine-readable [`CITATION.cff`](https://github.com/georgegach/flowiz/blob/master/CITATION.cff)
lets GitHub render a "Cite this repository" button. A Zenodo DOI is minted per
release.
