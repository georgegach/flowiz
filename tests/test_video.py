"""Video compilation and helpers."""

from __future__ import annotations

import numpy as np
import pytest

import flowiz as fz
from flowiz.io.flo import write_flo
from flowiz.video import natural_sort, write_video


def _make_sequence(tmp_path, n=3):
    paths = []
    for i in range(1, n + 1):
        ys, xs = np.mgrid[0:24, 0:32]
        data = np.dstack([(xs - 16) * i * 0.1, (ys - 12) * i * 0.1]).astype(np.float32)
        p = tmp_path / f"frame_{i:04d}.flo"
        write_flo(fz.as_flow(data), str(p))
        paths.append(str(p))
    return paths


def test_natural_sort():
    files = ["frame_10.flo", "frame_2.flo", "frame_1.flo"]
    assert natural_sort(files) == ["frame_1.flo", "frame_2.flo", "frame_10.flo"]


def test_write_gif(tmp_path):
    files = _make_sequence(tmp_path)
    out = tmp_path / "out.gif"
    result = write_video(files, str(out), fps=4, normalize="sequence")
    assert out.exists() and out.stat().st_size > 0
    assert result == str(out)


def test_write_mp4(tmp_path):
    files = _make_sequence(tmp_path)
    out = tmp_path / "out.mp4"
    write_video(files, str(out), fps=8, normalize="frame")
    assert out.exists() and out.stat().st_size > 0


def test_progress_callback(tmp_path):
    files = _make_sequence(tmp_path, n=4)
    seen = []
    write_video(files, str(tmp_path / "o.gif"), fps=4, progress=seen.append)
    assert seen == [1, 2, 3, 4]


def test_fixed_max_flow(tmp_path):
    files = _make_sequence(tmp_path)
    write_video(files, str(tmp_path / "o.gif"), max_flow=5.0)


def test_empty_raises(tmp_path):
    with pytest.raises(ValueError):
        write_video([], str(tmp_path / "o.mp4"))


def test_bad_normalize(tmp_path):
    files = _make_sequence(tmp_path)
    with pytest.raises(ValueError):
        write_video(files, str(tmp_path / "o.gif"), normalize="bogus")
