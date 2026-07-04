"""Run every shipped example script end-to-end (in a temp working dir)."""

from __future__ import annotations

import os
import runpy
from pathlib import Path

import pytest

EXAMPLES_DIR = Path(__file__).resolve().parent.parent / "examples"
SCRIPTS = sorted(EXAMPLES_DIR.glob("[0-9]*.py"))


@pytest.mark.parametrize("script", SCRIPTS, ids=lambda p: p.name)
def test_example_runs(script, tmp_path, monkeypatch):
    # Examples write output files into the current directory.
    monkeypatch.chdir(tmp_path)
    runpy.run_path(str(script), run_name="__main__")
    # Each example produces at least one output artifact.
    produced = list(tmp_path.iterdir())
    assert produced, f"{script.name} produced no output"
    assert os.getcwd() == str(tmp_path)
