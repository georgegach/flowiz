"""NumPy ``.npy`` / ``.npz`` flow dumps (common for saved model outputs)."""

from __future__ import annotations

import numpy as np

from flowiz.core.flow import Flow


def _as_hw2(arr: np.ndarray) -> np.ndarray:
    if arr.ndim == 3 and arr.shape[2] == 2:
        return arr
    if arr.ndim == 3 and arr.shape[0] == 2:
        return np.transpose(arr, (1, 2, 0))
    raise ValueError(f"Cannot interpret array of shape {arr.shape} as flow.")


def read_npy(path: str) -> Flow:
    """Read a flow array saved as ``.npy`` or ``.npz``.

    Arrays laid out ``(H, W, 2)`` or ``(2, H, W)`` are auto-detected. For
    ``.npz`` the first array (or one keyed ``flow``) is used.
    """
    obj = np.load(path, allow_pickle=False)
    if hasattr(obj, "files"):  # NpzFile
        key = "flow" if "flow" in obj.files else obj.files[0]
        arr = obj[key]
    else:
        arr = obj
    data = np.ascontiguousarray(_as_hw2(np.asarray(arr)), dtype=np.float32)
    return Flow(data=data, source=path)


def write_npy(flow: Flow, path: str) -> None:
    """Write a :class:`Flow` as an ``(H, W, 2)`` float32 ``.npy`` file."""
    np.save(path, flow.data.astype(np.float32))
