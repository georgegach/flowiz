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


def test_compare_grid_saves(tmp_path, radial_flow):
    import matplotlib.pyplot as plt

    out = tmp_path / "grid.png"
    fig = fz.compare_grid(radial_flow + 0.5, radial_flow, save=str(out))
    assert out.exists()
    plt.close(fig)


def test_error_map_fixed_scale(random_flow):
    em = fz.error_map(random_flow + 2.0, random_flow, max_epe=1.0)
    assert em.shape == (*random_flow.shape[:2], 3)


def test_epe_shape_mismatch():
    import pytest

    with pytest.raises(ValueError):
        fz.epe(np.zeros((4, 4, 2), dtype=np.float32), np.zeros((5, 5, 2), dtype=np.float32))


def test_fl_score_shape_mismatch():
    import pytest

    with pytest.raises(ValueError):
        fz.fl_score(np.zeros((4, 4, 2), dtype=np.float32), np.zeros((5, 5, 2), dtype=np.float32))


def test_metrics_respect_valid_mask():
    data_a = np.zeros((4, 4, 2), dtype=np.float32)
    data_b = np.ones((4, 4, 2), dtype=np.float32) * 100
    valid = np.zeros((4, 4), dtype=bool)
    valid[0, 0] = True
    data_b[0, 0] = 0  # the one valid pixel matches
    a = fz.Flow(data=data_a, valid=valid)
    b = fz.Flow(data=data_b, valid=valid)
    assert fz.epe(a, b).mean == 0.0
    assert fz.fl_score(a, b) == 0.0
