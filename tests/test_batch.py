"""Batch conversion, including the multiprocessing path."""

from __future__ import annotations

import numpy as np
import pytest

import flowiz as fz
from flowiz.batch import convert_files
from flowiz.io.flo import write_flo


def _seq(tmp_path, n=3):
    paths = []
    for i in range(1, n + 1):
        data = (np.ones((12, 16, 2), dtype=np.float32) * i).astype(np.float32)
        p = tmp_path / f"frame_{i:04d}.flo"
        write_flo(fz.as_flow(data), str(p))
        paths.append(str(p))
    return paths


def test_convert_serial(tmp_path):
    files = _seq(tmp_path)
    out = tmp_path / "png"
    results = convert_files(files, str(out), workers=1)
    assert len(results) == 3
    assert all((out / p).exists() for p in ["frame_0001.flo.png"])


def test_convert_parallel(tmp_path):
    files = _seq(tmp_path)
    out = tmp_path / "png"
    results = convert_files(files, str(out), workers=2)
    assert len(results) == 3


def test_convert_inplace(tmp_path):
    files = _seq(tmp_path, n=1)
    convert_files(files, None)
    assert (tmp_path / "frame_0001.flo.png").exists()


def test_convert_bad_mode(tmp_path):
    with pytest.raises(ValueError):
        convert_files(_seq(tmp_path, n=1), str(tmp_path), mode="bogus")


def test_convert_uv_stacks(tmp_path):
    files = _seq(tmp_path, n=1)
    out = tmp_path / "uv"
    convert_files(files, str(out), mode="uv")
    assert (out / "frame_0001.flo.png").exists()
