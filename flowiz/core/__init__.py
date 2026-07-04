"""Pure, side-effect-free optical flow operations."""

from flowiz.core.colorize import (
    colorize,
    colorize_sequence,
    flow_to_angle,
    flow_to_magnitude,
    flow_to_uv,
    make_colorwheel,
    wheel_legend,
)
from flowiz.core.flow import Flow, as_flow
from flowiz.core.metrics import EpeResult, compare_grid, epe, error_map, fl_score
from flowiz.core.quiver import quiver

__all__ = [
    "Flow",
    "as_flow",
    "colorize",
    "colorize_sequence",
    "flow_to_uv",
    "flow_to_magnitude",
    "flow_to_angle",
    "make_colorwheel",
    "wheel_legend",
    "quiver",
    "epe",
    "fl_score",
    "error_map",
    "compare_grid",
    "EpeResult",
]
