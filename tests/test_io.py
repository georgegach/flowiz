"""Round-trip and dispatch tests for every supported format."""

from __future__ import annotations

import numpy as np
import pytest

import flowiz as fz
from flowiz.io.flo import read_flo, write_flo
from flowiz.io.kitti import read_kitti, write_kitti
from flowiz.io.npy import read_npy, write_npy
from flowiz.io.pfm import read_pfm


def test_flo_roundtrip(tmp_path, random_flow):
    flow = fz.as_flow(random_flow)
    path = tmp_path / "a.flo"
    write_flo(flow, str(path))
    back = read_flo(str(path))
    assert np.allclose(back.data, flow.data)
    assert back.shape == flow.shape


def test_npy_roundtrip(tmp_path, random_flow):
    flow = fz.as_flow(random_flow)
    path = tmp_path / "a.npy"
    write_npy(flow, str(path))
    back = read_npy(str(path))
    assert np.allclose(back.data, flow.data)


def test_kitti_roundtrip(tmp_path, radial_flow):
    flow = fz.as_flow(radial_flow)
    path = tmp_path / "a.png"
    write_kitti(flow, str(path))
    back = read_kitti(str(path))
    # KITTI quantizes to 1/64 px; allow that tolerance.
    assert np.max(np.abs(back.u - flow.u)) < 0.02
    assert back.valid is not None


def test_dispatch_reads_flo(tmp_path, random_flow):
    path = tmp_path / "x.flo"
    write_flo(fz.as_flow(random_flow), str(path))
    flow = fz.read(str(path))
    assert flow.shape == random_flow.shape[:2]


def test_dispatch_unknown_extension(tmp_path):
    p = tmp_path / "junk.xyz"
    p.write_bytes(b"not a flow file at all")
    with pytest.raises(ValueError):
        fz.read(str(p))


def test_dispatch_missing_file():
    with pytest.raises(FileNotFoundError):
        fz.read("/nonexistent/path.flo")


def test_pfm_roundtrip(tmp_path, radial_flow):
    # Write a minimal 2-channel-as-3 PFM (u, v, valid) then read it back.
    path = tmp_path / "a.pfm"
    h, w = radial_flow.shape[:2]
    third = np.ones((h, w, 1), dtype=np.float32)
    data = np.concatenate([radial_flow, third], axis=2).astype(np.float32)
    with open(path, "wb") as f:
        f.write(b"PF\n")
        f.write(f"{w} {h}\n".encode())
        f.write(b"-1.0\n")  # little-endian
        f.write(np.flipud(data).astype("<f4").tobytes())
    back = read_pfm(str(path))
    assert np.allclose(back.u, radial_flow[..., 0], atol=1e-4)
    assert back.valid is not None


def test_torch_interop_shapes():
    class FakeTensor:
        def __init__(self, arr):
            self._arr = arr

        def detach(self):
            return self

        def cpu(self):
            return self

        def numpy(self):
            return self._arr

    chw = FakeTensor(np.zeros((2, 8, 8), dtype=np.float32))
    flow = fz.from_tensor(chw)
    assert flow.shape == (8, 8)

    batched = FakeTensor(np.zeros((3, 2, 8, 8), dtype=np.float32))
    flows = fz.from_tensor(batched)
    assert isinstance(flows, list) and len(flows) == 3
