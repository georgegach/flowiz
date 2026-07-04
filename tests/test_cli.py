"""End-to-end CLI tests via Typer's CliRunner."""

from __future__ import annotations

from pathlib import Path

import numpy as np
from typer.testing import CliRunner

import flowiz as fz
from flowiz.cli.app import app
from flowiz.io.flo import write_flo

runner = CliRunner()


def _make_flo(path: Path, scale: float = 1.0) -> None:
    ys, xs = np.mgrid[0:16, 0:16]
    data = np.dstack([(xs - 8) * scale, (ys - 8) * scale]).astype(np.float32)
    write_flo(fz.as_flow(data), str(path))


def test_version():
    result = runner.invoke(app, ["--version"])
    assert result.exit_code == 0
    assert "flowiz" in result.stdout


def test_convert(tmp_path):
    src = tmp_path / "frame_0001.flo"
    _make_flo(src)
    out = tmp_path / "out"
    result = runner.invoke(app, ["convert", str(src), "-o", str(out)])
    assert result.exit_code == 0
    assert (out / "frame_0001.flo.png").exists()


def test_info(tmp_path):
    src = tmp_path / "a.flo"
    _make_flo(src)
    result = runner.invoke(app, ["info", str(src)])
    assert result.exit_code == 0
    assert "magnitude" in result.stdout


def test_compare(tmp_path):
    a = tmp_path / "pred.flo"
    b = tmp_path / "gt.flo"
    _make_flo(a, scale=1.1)
    _make_flo(b, scale=1.0)
    result = runner.invoke(app, ["compare", str(a), str(b)])
    assert result.exit_code == 0
    assert "EPE" in result.stdout


def test_convert_no_match(tmp_path):
    result = runner.invoke(app, ["convert", str(tmp_path / "nope_*.flo")])
    assert result.exit_code == 1
