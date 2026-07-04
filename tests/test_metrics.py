"""Metrics: EPE, Fl-score, error maps, compare grid."""

from __future__ import annotations

import numpy as np

import flowiz as fz


def test_epe_zero_for_identical(random_flow):
    result = fz.epe(random_flow, random_flow)
    assert result.mean == 0.0
    assert result.per_pixel.shape == random_flow.shape[:2]


def test_epe_known_offset(random_flow):
    shifted = random_flow.copy()
    shifted[..., 0] += 3.0  # constant 3px offset in u
    result = fz.epe(shifted, random_flow)
    assert np.isclose(result.mean, 3.0, atol=1e-4)


def test_fl_score_bounds(random_flow):
    fl = fz.fl_score(random_flow + 10.0, random_flow)
    assert 0.0 <= fl <= 100.0


def test_fl_score_perfect(random_flow):
    assert fz.fl_score(random_flow, random_flow) == 0.0


def test_error_map_shape(random_flow):
    em = fz.error_map(random_flow + 1.0, random_flow)
    assert em.shape == (*random_flow.shape[:2], 3)
    assert em.dtype == np.uint8


def test_compare_grid_returns_figure(radial_flow):
    fig = fz.compare_grid(radial_flow + 0.5, radial_flow)
    assert fig is not None
    import matplotlib.pyplot as plt

    plt.close(fig)
