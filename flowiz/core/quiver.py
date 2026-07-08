"""Vector (quiver) overlays on top of a colorized flow field."""

from __future__ import annotations

from typing import Any, Optional

import numpy as np

from flowiz.core.colorize import colorize
from flowiz.core.flow import as_flow


def quiver(
    flow: Any,
    *,
    background: Optional[np.ndarray] = None,
    step: int = 16,
    scale: float = 1.0,
    color: tuple[int, int, int] = (255, 255, 255),
    max_flow: Optional[float] = None,
) -> np.ndarray:
    """Draw flow vectors on a grid over a background image.

    Uses matplotlib's quiver for anti-aliased arrows and returns an
    ``(H, W, 3)`` uint8 RGB image the same size as the input flow.

    Args:
        flow: flow input (Flow / array / tensor).
        background: RGB image to draw on. Defaults to the colorized flow.
        step: grid spacing in pixels between sampled vectors.
        scale: multiplier on arrow length.
        color: RGB arrow color.
        max_flow: passed through to the default colorized background.
    """
    import matplotlib

    matplotlib.use("Agg", force=False)
    import matplotlib.pyplot as plt

    f = as_flow(flow)
    h, w = f.shape
    if background is None:
        background = colorize(f, max_flow=max_flow)

    ys, xs = np.mgrid[step // 2 : h : step, step // 2 : w : step]
    u = f.u[ys, xs] * scale
    v = f.v[ys, xs] * scale

    dpi = 100
    fig = plt.figure(figsize=(w / dpi, h / dpi), dpi=dpi)
    ax = fig.add_axes((0, 0, 1, 1))
    ax.imshow(background, extent=(0, w, h, 0))
    ax.quiver(
        xs, ys, u, -v,
        color=np.array(color) / 255.0,
        angles="xy", scale_units="xy", scale=1.0,
        width=0.002, headwidth=3,
    )
    ax.set_xlim(0, w)
    ax.set_ylim(h, 0)
    ax.axis("off")

    fig.canvas.draw()
    # buffer_rgba() exists on the Agg canvas but isn't declared on the base class.
    buf = np.asarray(fig.canvas.buffer_rgba())  # type: ignore[attr-defined]
    plt.close(fig)

    img = buf[..., :3].copy()
    if img.shape[:2] != (h, w):
        from PIL import Image

        img = np.asarray(Image.fromarray(img).resize((w, h)))
    return img
