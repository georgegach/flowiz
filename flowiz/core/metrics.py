"""Optical flow evaluation metrics and comparison figures."""

from __future__ import annotations

from typing import Any, NamedTuple, Optional

import numpy as np

from flowiz.core.colorize import colorize
from flowiz.core.flow import Flow, as_flow


class EpeResult(NamedTuple):
    """End-point-error summary over valid pixels."""

    per_pixel: np.ndarray  # (H, W) float32, EPE at every pixel
    mean: float
    median: float
    p90: float  # 90th percentile
    valid_fraction: float


def _combined_valid(pred: Flow, gt: Flow) -> np.ndarray:
    mask = np.ones(gt.shape, dtype=bool)
    if pred.valid is not None:
        mask &= pred.valid
    if gt.valid is not None:
        mask &= gt.valid
    return mask


def epe(pred: Any, gt: Any) -> EpeResult:
    """End-point error between a predicted and ground-truth flow.

    EPE is the per-pixel Euclidean distance ``||pred - gt||``. Summary
    statistics are computed over pixels valid in both inputs.
    """
    p = as_flow(pred)
    g = as_flow(gt)
    if p.shape != g.shape:
        raise ValueError(f"Shape mismatch: pred {p.shape} vs gt {g.shape}.")

    per_pixel = np.sqrt(np.sum((p.data - g.data) ** 2, axis=-1)).astype(np.float32)
    mask = _combined_valid(p, g)
    vals = per_pixel[mask]
    if vals.size == 0:
        return EpeResult(per_pixel, 0.0, 0.0, 0.0, 0.0)
    return EpeResult(
        per_pixel=per_pixel,
        mean=float(np.mean(vals)),
        median=float(np.median(vals)),
        p90=float(np.percentile(vals, 90)),
        valid_fraction=float(mask.mean()),
    )


def fl_score(pred: Any, gt: Any) -> float:
    """KITTI Fl outlier rate (percent).

    A pixel is an outlier when its EPE exceeds 3 px *and* exceeds 5% of the
    ground-truth magnitude. Returns the percentage of outliers over valid px.
    """
    p = as_flow(pred)
    g = as_flow(gt)
    if p.shape != g.shape:
        raise ValueError(f"Shape mismatch: pred {p.shape} vs gt {g.shape}.")

    err = np.sqrt(np.sum((p.data - g.data) ** 2, axis=-1))
    gt_mag = g.magnitude
    mask = _combined_valid(p, g)
    if mask.sum() == 0:
        return 0.0
    outliers = (err > 3.0) & (err > 0.05 * gt_mag)
    return float(100.0 * outliers[mask].sum() / mask.sum())


def error_map(
    pred: Any,
    gt: Any,
    *,
    cmap: str = "magma",
    max_epe: Optional[float] = None,
) -> np.ndarray:
    """Per-pixel EPE rendered as an ``(H, W, 3)`` uint8 heatmap."""
    import matplotlib

    result = epe(pred, gt)
    err = result.per_pixel.astype(np.float64)
    norm = max_epe if max_epe is not None else (float(np.max(err)) if err.size else 0.0)
    err = np.clip(err / (norm + 1e-5), 0, 1)
    rgba = matplotlib.colormaps[cmap](err)
    return (rgba[..., :3] * 255).astype(np.uint8)


def compare_grid(
    pred: Any,
    gt: Any,
    *,
    titles: tuple[str, str, str] = ("Prediction", "Ground truth", "EPE"),
    max_flow: Optional[float] = None,
    dpi: int = 200,
    save: Optional[str] = None,
):
    """Build a prediction | ground-truth | error-map figure — the paper money shot.

    Normalizes both flow panels by a shared ``max_flow`` so colors are
    comparable. Annotates EPE / Fl-score in the suptitle. Returns the matplotlib
    ``Figure`` and, if ``save`` is given, writes it to disk.
    """
    import matplotlib

    matplotlib.use("Agg", force=False)
    import matplotlib.pyplot as plt

    p = as_flow(pred)
    g = as_flow(gt)
    if max_flow is None:
        max_flow = max(p.max_magnitude(), g.max_magnitude())

    result = epe(p, g)
    fl = fl_score(p, g)

    pred_img = colorize(p, max_flow=max_flow)
    gt_img = colorize(g, max_flow=max_flow)
    err_img = error_map(p, g)

    fig, axes = plt.subplots(1, 3, figsize=(15, 5), dpi=dpi)
    for ax, img, title in zip(axes, (pred_img, gt_img, err_img), titles):
        ax.imshow(img)
        ax.set_title(title)
        ax.axis("off")
    fig.suptitle(f"EPE {result.mean:.3f} px    Fl {fl:.2f}%", fontsize=13)
    fig.tight_layout()

    if save:
        fig.savefig(save, dpi=dpi, bbox_inches="tight")
    return fig
