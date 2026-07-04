"""Portable Float Map ``.pfm`` format (used by Sintel, FlyingThings, etc.)."""

from __future__ import annotations

import re

import numpy as np

from flowiz.core.flow import Flow


def read_pfm(path: str) -> Flow:
    """Read a ``.pfm`` file into a :class:`Flow`.

    Accepts 2-channel (u, v) or 3-channel PFM where the third channel is a
    validity/ignore band (common in Sintel flow dumps); extra channels beyond
    the first two are dropped.
    """
    with open(path, "rb") as f:
        header = f.readline().rstrip()
        if header not in (b"PF", b"Pf"):
            raise ValueError(f"{path} is not a PFM file (header {header!r}).")
        color = header == b"PF"

        dim_line = f.readline().decode("ascii")
        m = re.match(r"^(\d+)\s+(\d+)\s*$", dim_line)
        if not m:
            raise ValueError(f"Malformed PFM dimensions: {dim_line!r}.")
        width, height = int(m.group(1)), int(m.group(2))

        scale = float(f.readline().decode("ascii").strip())
        endian = "<" if scale < 0 else ">"

        channels = 3 if color else 1
        data = np.frombuffer(f.read(), endian + "f")
        data = data.reshape(height, width, channels)
        data = np.flipud(data)  # PFM is stored bottom-to-top

    if channels == 1:
        raise ValueError(f"{path} is a single-channel PFM (depth?), not a flow field.")

    valid = None
    if channels >= 3:
        valid = data[..., 2] > 0
    flow = np.ascontiguousarray(data[..., :2], dtype=np.float32)
    return Flow(data=flow, valid=valid, source=path)
