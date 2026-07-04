# flowiz examples

Runnable scripts demonstrating common workflows. Each uses the sample flows in
[`../demo/flo/`](../demo/flo/).

| Script | What it shows |
|---|---|
| [`01_quickstart.py`](01_quickstart.py) | Read a `.flo`, colorize, save a PNG |
| [`02_kitti_groundtruth.py`](02_kitti_groundtruth.py) | Read a KITTI 16-bit flow PNG with its validity mask |
| [`03_raft_output_torch.py`](03_raft_output_torch.py) | Turn a model's torch tensor into a visualization |
| [`04_error_maps_paper_figure.py`](04_error_maps_paper_figure.py) | EPE / Fl-score and a `compare_grid` paper figure |
| [`05_video_from_sequence.py`](05_video_from_sequence.py) | Flicker-free video from a flow sequence |

Run any of them from the repo root:

```bash
pip install -e .
python examples/01_quickstart.py
```
