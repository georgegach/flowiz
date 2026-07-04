# flowiz

**The optical flow visualization toolkit.** Read any flow format, render
publication-quality color maps, compute error maps against ground truth, compile
temporally-consistent videos — or drag-drop a flow file into the
[browser viewer](https://georgegach.github.io/flowiz/).

```bash
pip install flowiz -U
```

```python
import flowiz as fz

flow = fz.read("frame_0001.flo")
img = fz.colorize(flow)
```

- **[Getting started](getting-started.md)** — install and first render
- **[Formats](formats.md)** — `.flo`, KITTI, PFM, NumPy, Spring, tensors
- **[Visualization](visualization.md)** — color wheel, encodings, legends, quiver
- **[Metrics](metrics.md)** — EPE, Fl-score, error maps, compare grids
- **[flowiz for papers](papers.md)** — reproducible figures and citation
- **[API reference](api.md)** — every public function
