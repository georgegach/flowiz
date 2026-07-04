"""Format-detecting flow ``read`` / ``write`` dispatch."""

from __future__ import annotations

import os
from typing import Any

import numpy as np

from flowiz.core.flow import Flow, as_flow
from flowiz.io.flo import read_flo, write_flo
from flowiz.io.flo5 import read_flo5
from flowiz.io.kitti import read_kitti, write_kitti
from flowiz.io.npy import read_npy, write_npy
from flowiz.io.pfm import read_pfm

__all__ = ["read", "write", "read_flo", "write_flo"]

_FLO_TAG = b"\xd2\x2d\x46\x47"  # 202021.25 as little-endian float32 == b"PIEH"


def _looks_like_flo(path: str) -> bool:
    try:
        with open(path, "rb") as f:
            return f.read(4) == b"PIEH"
    except OSError:
        return False


def read(source: Any) -> Flow:
    """Read a flow field from any supported source.

    Dispatches on file extension, then magic bytes:

    - ``.flo`` — Middlebury
    - ``.png`` — KITTI 16-bit flow
    - ``.pfm`` — Sintel / FlyingThings
    - ``.npy`` / ``.npz`` — saved numpy arrays
    - ``.flo5`` / ``.h5`` — Spring (requires ``h5py``)

    Non-path inputs (numpy arrays, torch tensors, existing ``Flow`` objects)
    are normalized via :func:`flowiz.core.as_flow`.
    """
    if isinstance(source, Flow):
        return source
    if isinstance(source, np.ndarray) or hasattr(source, "detach"):
        return as_flow(source)
    if not isinstance(source, (str, os.PathLike)):
        raise TypeError(f"Cannot read flow from {type(source).__name__}.")

    path = os.fspath(source)
    if not os.path.isfile(path):
        raise FileNotFoundError(f"No such file: {path}")

    ext = path.rsplit(".", 1)[-1].lower() if "." in os.path.basename(path) else ""
    if ext == "flo":
        return read_flo(path)
    if ext == "png":
        return read_kitti(path)
    if ext == "pfm":
        return read_pfm(path)
    if ext in ("npy", "npz"):
        return read_npy(path)
    if ext in ("flo5", "h5", "hdf5"):
        return read_flo5(path)

    # Unknown extension: sniff magic bytes for a raw .flo.
    if _looks_like_flo(path):
        return read_flo(path)
    raise ValueError(
        f"Unsupported or unrecognized flow file: {path}. "
        "Supported: .flo, KITTI .png, .pfm, .npy/.npz, .flo5."
    )


def write(flow: Any, path: str) -> None:
    """Write a flow field, choosing the format from ``path``'s extension.

    Supports ``.flo`` (Middlebury), ``.png`` (KITTI 16-bit), and ``.npy``.
    """
    f = as_flow(flow)
    ext = path.rsplit(".", 1)[-1].lower() if "." in os.path.basename(path) else ""
    if ext == "flo":
        write_flo(f, path)
    elif ext == "png":
        write_kitti(f, path)
    elif ext == "npy":
        write_npy(f, path)
    else:
        raise ValueError(
            f"Cannot write flow to '{path}'. Writable formats: .flo, .png (KITTI), .npy."
        )
