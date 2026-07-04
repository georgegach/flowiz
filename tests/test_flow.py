"""The Flow container and as_flow normalization."""

from __future__ import annotations

import numpy as np
import pytest

import flowiz as fz
from flowiz.core.flow import as_flow


def test_properties(radial_flow):
    f = fz.as_flow(radial_flow)
    assert f.height == radial_flow.shape[0]
    assert f.width == radial_flow.shape[1]
    assert f.shape == radial_flow.shape[:2]
    assert np.allclose(f.u, radial_flow[..., 0])
    assert np.allclose(f.v, radial_flow[..., 1])
    assert np.allclose(f.magnitude, np.hypot(radial_flow[..., 0], radial_flow[..., 1]))
    assert f.angle.shape == radial_flow.shape[:2]
    assert f.max_magnitude() > 0


def test_array_protocol(radial_flow):
    f = fz.as_flow(radial_flow)
    arr = np.asarray(f)
    assert arr.shape == radial_flow.shape
    assert np.asarray(f, dtype=np.float64).dtype == np.float64


def test_max_magnitude_respects_valid():
    data = np.ones((4, 4, 2), dtype=np.float32) * 10
    valid = np.zeros((4, 4), dtype=bool)
    valid[0, 0] = True
    data[0, 0] = 0
    f = fz.Flow(data=data, valid=valid)
    assert f.max_magnitude() == 0.0


def test_max_magnitude_empty_valid():
    data = np.ones((2, 2, 2), dtype=np.float32)
    f = fz.Flow(data=data, valid=np.zeros((2, 2), dtype=bool))
    assert f.max_magnitude() == 0.0


def test_post_init_bad_shape():
    with pytest.raises(ValueError):
        fz.Flow(data=np.zeros((4, 4, 3), dtype=np.float32))


def test_post_init_bad_valid_shape():
    with pytest.raises(ValueError):
        fz.Flow(data=np.zeros((4, 4, 2), dtype=np.float32), valid=np.zeros((3, 3), dtype=bool))


def test_as_flow_passthrough(radial_flow):
    f = fz.as_flow(radial_flow)
    assert as_flow(f) is f


def test_as_flow_chw_transpose():
    chw = np.zeros((2, 8, 12), dtype=np.float32)
    chw[0] = 1.0  # u channel
    f = as_flow(chw)
    assert f.shape == (8, 12)
    assert np.allclose(f.u, 1.0)


def test_as_flow_copies_input():
    arr = np.ones((4, 4, 2), dtype=np.float32)
    f = as_flow(arr)
    f.data[0, 0, 0] = 999
    assert arr[0, 0, 0] == 1.0  # original untouched


def test_as_flow_bad_shape():
    with pytest.raises(ValueError):
        as_flow(np.zeros((4, 4), dtype=np.float32))


def test_as_flow_dtype_is_float32():
    f = as_flow(np.zeros((4, 4, 2), dtype=np.float64))
    assert f.data.dtype == np.float32
