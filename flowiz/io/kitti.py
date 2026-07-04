"""KITTI optical flow format (16-bit 3-channel PNG).

KITTI stores flow as ``uint16``: ``flow = (value - 2**15) / 64`` for channels
0 (u) and 1 (v); channel 2 is the valid mask (>0 means valid).
"""

from __future__ import annotations

import numpy as np

from flowiz.core.flow import Flow


def read_kitti(path: str) -> Flow:
    """Read a KITTI 16-bit flow PNG into a :class:`Flow`."""
    from PIL import Image

    img = Image.open(path)
    arr = np.array(img)
    if arr.dtype != np.uint16 or arr.ndim != 3 or arr.shape[2] < 3:
        raise ValueError(
            f"{path} is not a KITTI flow PNG (need uint16 HxWx3, got "
            f"{arr.dtype} {arr.shape})."
        )
    u = (arr[..., 0].astype(np.float64) - 2**15) / 64.0
    v = (arr[..., 1].astype(np.float64) - 2**15) / 64.0
    valid = arr[..., 2] > 0
    data = np.dstack([u, v]).astype(np.float32)
    data[~valid] = 0.0
    return Flow(data=data, valid=valid, source=path)


def write_kitti(flow: Flow, path: str) -> None:
    """Write a :class:`Flow` to a KITTI 16-bit flow PNG."""
    import imageio.v2 as imageio

    h, w = flow.shape
    out = np.zeros((h, w, 3), dtype=np.uint16)
    out[..., 0] = np.clip(flow.u * 64.0 + 2**15, 0, 2**16 - 1).astype(np.uint16)
    out[..., 1] = np.clip(flow.v * 64.0 + 2**15, 0, 2**16 - 1).astype(np.uint16)
    valid = flow.valid if flow.valid is not None else np.ones((h, w), dtype=bool)
    out[..., 2] = valid.astype(np.uint16)
    # Pillow cannot save 16-bit RGB PNGs directly; imageio handles it.
    imageio.imwrite(path, out)
