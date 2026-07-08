"""Middlebury ``.flo`` format."""

from __future__ import annotations

from typing import BinaryIO, Union, cast

import numpy as np

from flowiz.core.flow import Flow

TAG_FLOAT = 202021.25
TAG_BYTES = b"PIEH"  # 202021.25 as little-endian float32


def read_flo(path: Union[str, BinaryIO]) -> Flow:
    """Read a Middlebury ``.flo`` file into a :class:`Flow`."""
    close = False
    if hasattr(path, "read"):
        f = cast("BinaryIO", path)
    else:
        f = cast("BinaryIO", open(path, "rb"))
        close = True
    try:
        tag = np.frombuffer(f.read(4), np.float32, count=1)[0]
        if float(tag) != TAG_FLOAT:
            raise ValueError(
                f"Not a valid .flo file: wrong tag {tag} (expected {TAG_FLOAT})."
            )
        width = int(np.frombuffer(f.read(4), np.int32, count=1)[0])
        height = int(np.frombuffer(f.read(4), np.int32, count=1)[0])
        if not (0 < width < 100000 and 0 < height < 100000):
            raise ValueError(f"Illegal .flo dimensions {width}x{height}.")
        data = np.frombuffer(
            f.read(2 * width * height * 4), np.float32, count=2 * width * height
        )
        # astype(copy=True) yields a fresh, writable, contiguous buffer — the
        # read-only frombuffer view is not aliased, so no extra .copy() needed.
        data = data.reshape(height, width, 2).astype(np.float32)
    finally:
        if close:
            f.close()

    source = path if isinstance(path, str) else "stream"
    return Flow(data=data, source=source)


def write_flo(flow: Flow, path: str) -> None:
    """Write a :class:`Flow` to a Middlebury ``.flo`` file."""
    h, w = flow.shape
    with open(path, "wb") as f:
        f.write(TAG_BYTES)
        np.array([w, h], dtype=np.int32).tofile(f)
        flow.data.astype(np.float32).tofile(f)
