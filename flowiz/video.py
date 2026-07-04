"""Stream a flow sequence to a video, normalized for temporal consistency.

Frames are colorized and piped straight into ``imageio-ffmpeg`` — no
``os.system`` (v2's shell-injection risk) and no need to write intermediate
PNGs. The ffmpeg binary ships with ``imageio-ffmpeg`` so no system install is
required.
"""

from __future__ import annotations

import os
import re
from typing import Any, Optional, Sequence

import numpy as np

from flowiz.core.colorize import colorize
from flowiz.io import read


def natural_sort(paths: Sequence[str]) -> list[str]:
    """Sort paths so ``frame_2`` precedes ``frame_10``."""

    def key(s: str):
        return [int(t) if t.isdigit() else t.lower() for t in re.split(r"(\d+)", s)]

    return sorted(paths, key=key)


def _sequence_max(files: Sequence[str]) -> float:
    mx = 0.0
    for f in files:
        mx = max(mx, read(f).max_magnitude())
    return mx


def write_video(
    files: Sequence[str],
    output: str,
    *,
    fps: int = 24,
    normalize: str = "sequence",
    max_flow: Optional[float] = None,
    quality: int = 8,
    progress: Optional[Any] = None,
    **colorize_kwargs: Any,
) -> str:
    """Compile flow files into a video (``.mp4``/``.webm``/``.gif`` by extension).

    Args:
        files: input flow file paths (any supported format). Sorted naturally.
        output: output video path; the container is inferred from the suffix.
        fps: frames per second.
        normalize: ``"sequence"`` normalizes every frame by the sequence-wide
            max magnitude (flicker-free — the default). ``"frame"`` normalizes
            each frame independently (v2 behavior). Ignored if ``max_flow`` set.
        max_flow: explicit fixed normalizer; overrides ``normalize``.
        quality: imageio quality (0-10) for lossy codecs.
        progress: optional callable invoked once per frame (e.g. a Rich task
            update) — receives the 1-based frame index.
    """
    import imageio.v2 as imageio

    ordered = natural_sort(list(files))
    if not ordered:
        raise ValueError("No input files given to write_video.")

    os.makedirs(os.path.dirname(os.path.abspath(output)), exist_ok=True)

    if max_flow is not None:
        norm: Optional[float] = float(max_flow)
    elif normalize == "sequence":
        norm = _sequence_max(ordered)
    elif normalize == "frame":
        norm = None
    else:
        raise ValueError("normalize must be 'sequence' or 'frame'.")

    is_gif = output.lower().endswith(".gif")
    writer_kwargs: dict[str, Any] = {"fps": fps}
    if not is_gif:
        writer_kwargs["quality"] = quality
        writer_kwargs["macro_block_size"] = None  # allow arbitrary dimensions

    writer = imageio.get_writer(output, **writer_kwargs)
    try:
        for i, path in enumerate(ordered, start=1):
            frame = colorize(read(path), max_flow=norm, **colorize_kwargs)
            writer.append_data(np.ascontiguousarray(frame))
            if progress is not None:
                progress(i)
    finally:
        writer.close()

    return output
