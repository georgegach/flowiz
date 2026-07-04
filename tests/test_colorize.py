"""Colorization behaviors: shapes, masking, sequence normalization, encodings."""

from __future__ import annotations

import numpy as np

import flowiz as fz


def test_colorize_shape_dtype(radial_flow):
    img = fz.colorize(radial_flow)
    assert img.shape == (*radial_flow.shape[:2], 3)
    assert img.dtype == np.uint8


def test_no_input_mutation(random_flow):
    original = random_flow.copy()
    fz.colorize(random_flow)
    assert np.array_equal(random_flow, original), "colorize must not mutate input"


def test_nan_rendered_black(radial_flow):
    f = radial_flow.copy()
    f[0, 0, 0] = np.nan
    img = fz.colorize(f, mask_invalid=True)
    assert tuple(img[0, 0]) == (0, 0, 0)


def test_valid_mask_masks_pixels(radial_flow):
    valid = np.ones(radial_flow.shape[:2], dtype=bool)
    valid[5, 5] = False
    flow = fz.Flow(data=radial_flow, valid=valid)
    img = fz.colorize(flow, mask_invalid=True)
    assert tuple(img[5, 5]) == (0, 0, 0)


def test_colorize_sequence_shared_norm(radial_flow):
    small = radial_flow * 0.1
    big = radial_flow * 10.0
    frames = fz.colorize_sequence([small, big], max_flow="sequence")
    assert len(frames) == 2
    # With a shared normalizer, the small frame is much dimmer than the big one.
    assert frames[0].mean() != frames[1].mean()


def test_fixed_max_flow_saturates(radial_flow):
    img = fz.colorize(radial_flow, max_flow=1.0, saturate=True)
    assert img.dtype == np.uint8


def test_uv_encoding(radial_flow):
    uv = fz.flow_to_uv(radial_flow)
    assert uv.shape == (*radial_flow.shape[:2], 2)


def test_magnitude_and_angle(radial_flow):
    assert fz.flow_to_magnitude(radial_flow).shape[2] == 3
    assert fz.flow_to_angle(radial_flow).shape[2] == 3


def test_wheel_legend_alpha():
    legend = fz.wheel_legend(64)
    assert legend.shape == (64, 64, 4)
    # Corner pixel (outside unit disk) is transparent.
    assert legend[0, 0, 3] == 0


def test_colorwheel_cached():
    assert fz.make_colorwheel() is fz.make_colorwheel()
    assert fz.make_colorwheel().shape == (55, 3)
