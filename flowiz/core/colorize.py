"""Optical flow colorization.

The color mapping is the Baker et al. / Middlebury color wheel, implemented to
be bit-compatible (within +-1 LSB) with the widely used ``flow_vis`` package so
that flowiz output matches figures across the literature. See
``tests/test_parity.py`` for the guardrail.
"""

from __future__ import annotations

from functools import lru_cache
from typing import Any, Literal, Optional, Sequence, Union

import numpy as np

from flowiz.core.flow import as_flow

Convention = Literal["middlebury", "hsv"]
MaxFlow = Optional[Union[float, Literal["sequence"]]]

_UNKNOWN_THRESH = 1e9
_EPS = 1e-5


@lru_cache(maxsize=1)
def make_colorwheel() -> np.ndarray:
    """Return the ``(55, 3)`` uint8 Middlebury color wheel.

    Cached — v2 rebuilt this on every frame.
    """
    RY, YG, GC, CB, BM, MR = 15, 6, 4, 11, 13, 6
    ncols = RY + YG + GC + CB + BM + MR
    wheel = np.zeros((ncols, 3), dtype=np.float64)
    col = 0

    # Red -> Yellow
    wheel[0:RY, 0] = 255
    wheel[0:RY, 1] = np.floor(255 * np.arange(RY) / RY)
    col += RY
    # Yellow -> Green
    wheel[col : col + YG, 0] = 255 - np.floor(255 * np.arange(YG) / YG)
    wheel[col : col + YG, 1] = 255
    col += YG
    # Green -> Cyan
    wheel[col : col + GC, 1] = 255
    wheel[col : col + GC, 2] = np.floor(255 * np.arange(GC) / GC)
    col += GC
    # Cyan -> Blue
    wheel[col : col + CB, 1] = 255 - np.floor(255 * np.arange(CB) / CB)
    wheel[col : col + CB, 2] = 255
    col += CB
    # Blue -> Magenta
    wheel[col : col + BM, 2] = 255
    wheel[col : col + BM, 0] = np.floor(255 * np.arange(BM) / BM)
    col += BM
    # Magenta -> Red
    wheel[col : col + MR, 2] = 255 - np.floor(255 * np.arange(MR) / MR)
    wheel[col : col + MR, 0] = 255

    return wheel.astype(np.uint8)


@lru_cache(maxsize=1)
def _colorwheel_normalized() -> np.ndarray:
    """Color wheel as ``(ncols, 3)`` float64 in ``[0, 1]`` — cached per process."""
    return make_colorwheel().astype(np.float64) / 255.0


def _uv_to_colors(u: np.ndarray, v: np.ndarray, convention: Convention) -> np.ndarray:
    """Map normalized (u, v) in roughly the unit disk to an RGB uint8 image."""
    rad = np.sqrt(np.square(u) + np.square(v))

    if convention == "hsv":
        # Alternative encoding: hue = direction, value = magnitude.
        import matplotlib.colors as mcolors

        ang = (np.arctan2(v, u) + np.pi) / (2 * np.pi)
        val = np.clip(rad, 0, 1)
        hsv = np.stack([ang, np.ones_like(ang), val], axis=-1)
        return (mcolors.hsv_to_rgb(hsv) * 255).astype(np.uint8)

    wheel = _colorwheel_normalized()  # (ncols, 3), already scaled to [0, 1]
    ncols = wheel.shape[0]

    a = np.arctan2(-v, -u) / np.pi
    fk = (a + 1) / 2 * (ncols - 1)
    k0 = np.floor(fk).astype(np.int32)  # int32, not uint8 (v2 bug)
    k1 = k0 + 1
    k1[k1 == ncols] = 0
    f = (fk - k0)[..., None]

    # Gather all three channels at once (H, W, 3) — no per-channel Python loop.
    col = (1 - f) * wheel[k0] + f * wheel[k1]
    rad3 = rad[..., None]
    col = np.where(
        rad3 <= 1,
        1 - rad3 * (1 - col),   # increase saturation toward center
        col * 0.75,             # out of range -> darken
    )
    return np.floor(255 * col).astype(np.uint8)


def colorize(
    flow: Any,
    *,
    max_flow: Optional[float] = None,
    saturate: bool = True,
    mask_invalid: bool = True,
    convention: Convention = "middlebury",
    legend: bool = False,
) -> np.ndarray:
    """Colorize a flow field into an ``(H, W, 3)`` uint8 RGB image.

    Args:
        flow: a :class:`Flow`, numpy array ``(H, W, 2)``/``(2, H, W)``, or torch
            tensor.
        max_flow: normalization magnitude. ``None`` normalizes by this frame's
            max magnitude (default, matches ``flow_vis``). A float fixes the
            normalizer, which is what you want for temporally consistent video
            (see :func:`colorize_sequence`).
        saturate: when ``max_flow`` is a float, clip magnitudes above it instead
            of letting them wrap darker.
        mask_invalid: render pixels flagged invalid (by the flow's ``valid``
            mask or by NaN / >1e9 sentinels) as black.
        convention: ``"middlebury"`` (default) or ``"hsv"``.
        legend: overlay the color-wheel key in the bottom-right corner.
    """
    f = as_flow(flow)
    # astype already returns a fresh array — no extra .copy() needed.
    u = f.u.astype(np.float64)
    v = f.v.astype(np.float64)

    invalid = np.zeros(u.shape, dtype=bool)
    if f.valid is not None:
        invalid |= ~f.valid
    invalid |= np.isnan(u) | np.isnan(v)
    invalid |= (np.abs(u) > _UNKNOWN_THRESH) | (np.abs(v) > _UNKNOWN_THRESH)
    u[invalid] = 0.0
    v[invalid] = 0.0

    rad = np.sqrt(np.square(u) + np.square(v))
    if max_flow is None:
        norm = float(np.max(rad)) if rad.size else 0.0
    else:
        norm = float(max_flow)
        if saturate and norm > 0:
            scale = np.minimum(1.0, norm / np.maximum(rad, _EPS))
            u *= scale
            v *= scale

    u /= norm + _EPS
    v /= norm + _EPS

    img = _uv_to_colors(u, v, convention)

    if mask_invalid:
        img[invalid] = 0

    if legend:
        img = _overlay_legend(img)

    return img


def colorize_sequence(
    flows: Sequence[Any],
    *,
    max_flow: MaxFlow = "sequence",
    **kwargs: Any,
) -> list[np.ndarray]:
    """Colorize many flows with a shared normalizer (flicker-free video).

    ``max_flow="sequence"`` (default) computes one normalizer from the max
    magnitude across every frame — the fix for v2's per-frame flicker. Pass a
    float to fix it explicitly, or ``None`` to fall back to per-frame maxima.
    """
    frames = [as_flow(f) for f in flows]
    if max_flow == "sequence":
        norm: Optional[float] = max((fr.max_magnitude() for fr in frames), default=0.0)
    elif max_flow is None:
        norm = None
    else:
        norm = float(max_flow)
    return [colorize(fr, max_flow=norm, **kwargs) for fr in frames]


def flow_to_uv(flow: Any) -> np.ndarray:
    """Split flow into a normalized ``(H, W, 2)`` uint8 UV image (u, v channels)."""
    f = as_flow(flow)
    u = f.u.astype(np.float64)
    v = f.v.astype(np.float64)
    bad = np.isnan(u) | np.isnan(v) | (np.abs(u) > _UNKNOWN_THRESH) | (np.abs(v) > _UNKNOWN_THRESH)
    u[bad] = 0.0
    v[bad] = 0.0
    maxrad = float(np.max(np.sqrt(u**2 + v**2))) if u.size else 0.0
    u /= maxrad + _EPS
    v /= maxrad + _EPS
    uv = (np.dstack([u, v]) * 127.999 + 128).astype(np.uint8)
    return uv


def flow_to_magnitude(flow: Any, *, cmap: str = "magma", max_flow: Optional[float] = None) -> np.ndarray:
    """Magnitude heatmap as an ``(H, W, 3)`` uint8 RGB image."""
    import matplotlib

    f = as_flow(flow)
    mag = f.magnitude.astype(np.float64)
    norm = max_flow if max_flow is not None else (float(np.max(mag)) if mag.size else 0.0)
    mag = np.clip(mag / (norm + _EPS), 0, 1)
    rgba = matplotlib.colormaps[cmap](mag)
    return (rgba[..., :3] * 255).astype(np.uint8)


def flow_to_angle(flow: Any, *, cmap: str = "hsv") -> np.ndarray:
    """Direction map as an ``(H, W, 3)`` uint8 RGB image (angle -> hue)."""
    import matplotlib

    f = as_flow(flow)
    ang = (f.angle + np.pi) / (2 * np.pi)
    rgba = matplotlib.colormaps[cmap](ang)
    return (rgba[..., :3] * 255).astype(np.uint8)


@lru_cache(maxsize=8)
def wheel_legend(size: int = 128) -> np.ndarray:
    """Render the color-wheel key as an ``(size, size, 4)`` RGBA uint8 image.

    Pixels outside the unit disk are transparent.
    """
    ys, xs = np.mgrid[0:size, 0:size]
    cx = cy = (size - 1) / 2.0
    u = (xs - cx) / (size / 2.0)
    v = (ys - cy) / (size / 2.0)
    rad = np.sqrt(u**2 + v**2)
    rgb = _uv_to_colors(u, v, "middlebury")
    alpha = np.where(rad <= 1.0, 255, 0).astype(np.uint8)
    return np.dstack([rgb, alpha])


def _overlay_legend(img: np.ndarray, frac: float = 0.22) -> np.ndarray:
    """Composite the wheel legend into the bottom-right corner of ``img``."""
    h, w = img.shape[:2]
    size = max(24, int(min(h, w) * frac))
    legend = wheel_legend(size)
    out = img.copy()
    y0, x0 = h - size, w - size
    if y0 < 0 or x0 < 0:
        return out
    alpha = legend[..., 3:4].astype(np.float64) / 255.0
    region = out[y0:, x0:, :].astype(np.float64)
    blended = legend[..., :3].astype(np.float64) * alpha + region * (1 - alpha)
    out[y0:, x0:, :] = blended.astype(np.uint8)
    return out
