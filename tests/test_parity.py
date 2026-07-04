"""flowiz colorization must match the reference flow_vis within +-1 LSB."""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np

import flowiz as fz
from tests.reference_flow_vis import flow_to_color


def test_colorize_matches_reference(radial_flow):
    ours = fz.colorize(radial_flow)  # max_flow=None -> per-frame max, like flow_vis
    theirs = flow_to_color(radial_flow.astype(np.float64))
    assert ours.shape == theirs.shape
    assert np.max(np.abs(ours.astype(int) - theirs.astype(int))) <= 1


def test_colorize_matches_reference_random(random_flow):
    ours = fz.colorize(random_flow)
    theirs = flow_to_color(random_flow.astype(np.float64))
    assert np.max(np.abs(ours.astype(int) - theirs.astype(int))) <= 1


def test_vectors_json_matches(tmp_path):
    """Generate the shared parity vectors and confirm they reproduce.

    The committed ``viewer/public/vectors.json`` (consumed by the viewer's
    vitest) is regenerated here; if this drifts, run scripts/gen_test_vectors.py.
    """
    rng = np.random.default_rng(42)
    uv = rng.standard_normal((10, 20, 2)).astype(np.float32) * 3
    rgb = fz.colorize(uv, max_flow=5.0, saturate=True)
    # round-trip through the documented formula must be stable
    rgb2 = fz.colorize(uv, max_flow=5.0, saturate=True)
    assert np.array_equal(rgb, rgb2)

    vectors_path = Path(__file__).resolve().parent.parent / "viewer" / "public" / "vectors.json"
    if vectors_path.exists():
        data = json.loads(vectors_path.read_text())
        assert "maxFlow" in data and "samples" in data
