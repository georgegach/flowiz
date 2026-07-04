"""Parallel batch conversion of flow files to images."""

from __future__ import annotations

import os
from concurrent.futures import ProcessPoolExecutor
from typing import Any, Callable, Optional, Sequence

from PIL import Image

from flowiz.core.colorize import (
    colorize,
    flow_to_angle,
    flow_to_magnitude,
    flow_to_uv,
)
from flowiz.io import read

_RENDERERS: dict[str, Callable[..., Any]] = {
    "rgb": colorize,
    "uv": flow_to_uv,
    "mag": flow_to_magnitude,
    "angle": flow_to_angle,
}


def _output_path(src: str, outdir: Optional[str]) -> str:
    base = os.path.basename(src) + ".png"
    if outdir is None:
        return src + ".png"
    return os.path.join(outdir, base)


def _convert_one(args: tuple[str, Optional[str], str, dict]) -> str:
    src, outdir, mode, kwargs = args
    renderer = _RENDERERS[mode]
    flow = read(src)
    img = renderer(flow, **kwargs) if mode == "rgb" else renderer(flow)
    dst = _output_path(src, outdir)
    if img.ndim == 3 and img.shape[2] == 2:  # UV split -> stack channels side by side
        import numpy as np

        img = np.concatenate([img[..., 0], img[..., 1]], axis=1)
    Image.fromarray(img).save(dst)
    return dst


def convert_files(
    files: Sequence[str],
    outdir: Optional[str] = None,
    *,
    mode: str = "rgb",
    workers: int = 1,
    progress: Optional[Callable[[str], None]] = None,
    **kwargs: Any,
) -> list[str]:
    """Convert flow files to PNG images.

    Args:
        files: input flow paths.
        outdir: output directory (created if needed). ``None`` writes alongside
            each input as ``<name>.png``.
        mode: ``rgb`` | ``uv`` | ``mag`` | ``angle``.
        workers: process-pool size for parallel conversion.
        progress: optional callback invoked with each output path as it lands.
        **kwargs: forwarded to :func:`colorize` for ``mode="rgb"``.
    """
    if mode not in _RENDERERS:
        raise ValueError(f"Unknown mode '{mode}'. Choose from {sorted(_RENDERERS)}.")
    if outdir is not None:
        os.makedirs(outdir, exist_ok=True)

    tasks = [(f, outdir, mode, kwargs) for f in files]
    results: list[str] = []
    if workers and workers > 1:
        with ProcessPoolExecutor(max_workers=workers) as pool:
            for dst in pool.map(_convert_one, tasks):
                results.append(dst)
                if progress:
                    progress(dst)
    else:
        for task in tasks:
            dst = _convert_one(task)
            results.append(dst)
            if progress:
                progress(dst)
    return results
