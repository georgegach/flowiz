"""Convert PyTorch tensors to :class:`Flow` objects (no hard torch dependency)."""

from __future__ import annotations

from typing import Any

import numpy as np

from flowiz.core.flow import Flow, as_flow


def from_tensor(tensor: Any) -> "list[Flow] | Flow":
    """Convert a torch tensor to a :class:`Flow` (or list, if batched).

    Accepts ``(H, W, 2)``, ``(2, H, W)``, or a batched ``(N, 2, H, W)`` /
    ``(N, H, W, 2)`` tensor. Batched inputs return a list of flows. The tensor
    is detached and moved to CPU automatically.
    """
    arr = _tensor_to_numpy(tensor)
    if arr.ndim == 4:
        return [as_flow(arr[i], source="tensor") for i in range(arr.shape[0])]
    return as_flow(arr, source="tensor")


def _tensor_to_numpy(tensor: Any) -> np.ndarray:
    if hasattr(tensor, "detach"):
        tensor = tensor.detach()
    if hasattr(tensor, "cpu"):
        tensor = tensor.cpu()
    if hasattr(tensor, "numpy"):
        return np.asarray(tensor.numpy())
    return np.asarray(tensor)
