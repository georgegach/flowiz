"""flowiz — the optical flow visualization toolkit.

Quick start::

    import flowiz as fz

    flow = fz.read("frame_0001.flo")     # any format -> Flow
    img = fz.colorize(flow)              # (H, W, 3) uint8 RGB
    fz.write(flow, "out.npy")

See https://github.com/georgegach/flowiz for docs and the browser viewer.
"""

from __future__ import annotations

from flowiz.batch import convert_files
from flowiz.core import (
    EpeResult,
    Flow,
    as_flow,
    colorize,
    colorize_sequence,
    compare_grid,
    epe,
    error_map,
    fl_score,
    flow_to_angle,
    flow_to_magnitude,
    flow_to_uv,
    make_colorwheel,
    quiver,
    wheel_legend,
)
from flowiz.io import read, write
from flowiz.io.torch_interop import from_tensor
from flowiz.video import write_video

__version__ = "3.0.0"

__all__ = [
    "__version__",
    # containers / io
    "Flow",
    "as_flow",
    "read",
    "write",
    "from_tensor",
    # visualization
    "colorize",
    "colorize_sequence",
    "flow_to_uv",
    "flow_to_magnitude",
    "flow_to_angle",
    "make_colorwheel",
    "wheel_legend",
    "quiver",
    # metrics
    "epe",
    "fl_score",
    "error_map",
    "compare_grid",
    "EpeResult",
    # batch / video
    "convert_files",
    "write_video",
]
