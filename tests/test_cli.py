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


def test_convert_uv_mode(tmp_path):
    src = tmp_path / "frame_0001.flo"
    _make_flo(src)
    out = tmp_path / "out"
    result = runner.invoke(app, ["convert", str(src), "-o", str(out), "-m", "uv"])
    assert result.exit_code == 0
    assert (out / "frame_0001.flo.png").exists()


def test_convert_bad_mode(tmp_path):
    src = tmp_path / "a.flo"
    _make_flo(src)
    result = runner.invoke(app, ["convert", str(src), "-m", "nonsense"])
    assert result.exit_code == 1


def test_video(tmp_path):
    for i in range(1, 4):
        _make_flo(tmp_path / f"frame_{i:04d}.flo", scale=i * 0.2)
    out = tmp_path / "v.gif"
    result = runner.invoke(
        app, ["video", str(tmp_path / "frame_*.flo"), "-o", str(out), "-r", "4"]
    )
    assert result.exit_code == 0
    assert out.exists()


def test_info_bad_file(tmp_path):
    p = tmp_path / "junk.xyz"
    p.write_bytes(b"nope")
    result = runner.invoke(app, ["info", str(p)])
    assert result.exit_code == 1


def test_compare_save(tmp_path):
    a = tmp_path / "pred.flo"
    b = tmp_path / "gt.flo"
    _make_flo(a, scale=1.1)
    _make_flo(b, scale=1.0)
    grid = tmp_path / "grid.png"
    result = runner.invoke(app, ["compare", str(a), str(b), "--save", str(grid)])
    assert result.exit_code == 0
    assert grid.exists()


def test_view_missing_assets():
    # No bundled viewer assets in an editable/CI install -> graceful exit 1.
    result = runner.invoke(app, ["view", "--no-browser"])
    assert result.exit_code == 1
