"""Spring dataset ``.flo5`` format (HDF5-backed).

Requires the optional ``h5py`` dependency: ``pip install flowiz[spring]``.
"""

from __future__ import annotations

import numpy as np

from flowiz.core.flow import Flow


def read_flo5(path: str) -> Flow:
    """Read a Spring ``.flo5`` (HDF5) flow file into a :class:`Flow`."""
    try:
        import h5py
    except ImportError as exc:  # pragma: no cover - exercised only without h5py
        raise ImportError(
            "Reading .flo5 (Spring dataset) requires h5py. "
            "Install it with: pip install flowiz[spring]"
        ) from exc

    with h5py.File(path, "r") as f:
        if "flow" not in f:
            raise ValueError(f"{path} has no 'flow' dataset (keys: {list(f.keys())}).")
        data = np.asarray(f["flow"])
    if data.ndim == 3 and data.shape[0] == 2:
        data = np.transpose(data, (1, 2, 0))
    if data.ndim != 3 or data.shape[2] != 2:
        raise ValueError(f"Unexpected .flo5 flow shape {data.shape}.")
    return Flow(data=np.ascontiguousarray(data, dtype=np.float32), source=path)
