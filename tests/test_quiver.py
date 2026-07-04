"""Vector overlay rendering."""

from __future__ import annotations

import numpy as np

import flowiz as fz


def test_quiver_default_background(radial_flow):
    img = fz.quiver(radial_flow, step=8)
    assert img.shape == (*radial_flow.shape[:2], 3)
    assert img.dtype == np.uint8


def test_quiver_custom_background(radial_flow):
    h, w = radial_flow.shape[:2]
    bg = np.zeros((h, w, 3), dtype=np.uint8)
    img = fz.quiver(radial_flow, background=bg, step=12, color=(255, 0, 0))
    assert img.shape == (h, w, 3)
