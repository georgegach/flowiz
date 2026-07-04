"""Round-trip and dispatch tests for every supported format."""

from __future__ import annotations

import numpy as np
import pytest

import flowiz as fz
from flowiz.io.flo import read_flo, write_flo
from flowiz.io.kitti import (
    decode_kitti_array,
    encode_kitti_array,
    read_kitti,
    write_kitti,
)
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


def test_flo_read_from_stream(tmp_path, random_flow):
    path = tmp_path / "s.flo"
    write_flo(fz.as_flow(random_flow), str(path))
    with open(path, "rb") as fh:
        flow = read_flo(fh)
    assert flow.shape == random_flow.shape[:2]


def test_flo_read_bad_tag(tmp_path):
    p = tmp_path / "bad.flo"
    p.write_bytes(b"\x00\x00\x00\x00" + b"\x00" * 20)
    with pytest.raises(ValueError):
        read_flo(str(p))


def test_pfm_single_channel_rejected(tmp_path):
    p = tmp_path / "gray.pfm"
    with open(p, "wb") as f:
        f.write(b"Pf\n4 4\n-1.0\n")
        f.write(np.zeros((4, 4), dtype="<f4").tobytes())
    with pytest.raises(ValueError):
        read_pfm(str(p))


def test_pfm_big_endian(tmp_path, radial_flow):
    p = tmp_path / "be.pfm"
    h, w = radial_flow.shape[:2]
    third = np.ones((h, w, 1), dtype=np.float32)
    data = np.concatenate([radial_flow, third], axis=2).astype(">f4")
    with open(p, "wb") as f:
        f.write(b"PF\n")
        f.write(f"{w} {h}\n".encode())
        f.write(b"1.0\n")  # positive scale => big-endian
        f.write(np.flipud(data).tobytes())
    back = read_pfm(str(p))
    assert np.allclose(back.u, radial_flow[..., 0], atol=1e-3)


def test_npy_bad_shape(tmp_path):
    p = tmp_path / "bad.npy"
    np.save(p, np.zeros((4, 4), dtype=np.float32))
    with pytest.raises(ValueError):
        read_npy(str(p))


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


def test_kitti_pure_codec_roundtrip(radial_flow):
    flow = fz.as_flow(radial_flow)
    arr = encode_kitti_array(flow)
    assert arr.dtype == np.uint16 and arr.shape[2] == 3
    back = decode_kitti_array(arr)
    assert np.max(np.abs(back.u - flow.u)) < 0.02


def test_kitti_decode_rejects_wrong_dtype():
    with pytest.raises(ValueError):
        decode_kitti_array(np.zeros((4, 4, 3), dtype=np.uint8))


def test_npz_read(tmp_path, random_flow):
    path = tmp_path / "a.npz"
    np.savez(path, flow=random_flow)
    flow = fz.read(str(path))
    assert flow.shape == random_flow.shape[:2]


def test_npy_chw_layout(tmp_path):
    arr = np.zeros((2, 8, 10), dtype=np.float32)
    arr[0] = 1.0
    path = tmp_path / "chw.npy"
    np.save(path, arr)
    flow = read_npy(str(path))
    assert flow.shape == (8, 10)
    assert np.allclose(flow.u, 1.0)


def test_write_dispatch_all_formats(tmp_path, random_flow):
    for ext in ("flo", "png", "npy"):
        p = tmp_path / f"out.{ext}"
        fz.write(random_flow, str(p))
        assert p.exists()


def test_write_dispatch_bad_ext(tmp_path, random_flow):
    with pytest.raises(ValueError):
        fz.write(random_flow, str(tmp_path / "out.tiff"))


def test_read_array_and_flow_passthrough(random_flow):
    assert fz.read(random_flow).shape == random_flow.shape[:2]
    f = fz.as_flow(random_flow)
    assert fz.read(f) is f


def test_read_bad_type():
    with pytest.raises(TypeError):
        fz.read(12345)


def test_flo5_without_h5py(tmp_path, monkeypatch):
    # Simulate h5py being unavailable -> helpful ImportError.
    import builtins

    from flowiz.io.flo5 import read_flo5

    real_import = builtins.__import__

    def fake_import(name, *args, **kwargs):
        if name == "h5py":
            raise ImportError("no h5py")
        return real_import(name, *args, **kwargs)

    monkeypatch.setattr(builtins, "__import__", fake_import)
    with pytest.raises(ImportError):
        read_flo5(str(tmp_path / "x.flo5"))


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

    hwc = FakeTensor(np.zeros((8, 8, 2), dtype=np.float32))
    assert fz.from_tensor(hwc).shape == (8, 8)
