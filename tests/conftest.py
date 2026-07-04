"""Shared fixtures: synthetic flow fields generated at runtime."""

from __future__ import annotations

import numpy as np
import pytest


@pytest.fixture
def radial_flow() -> np.ndarray:
    """A smooth radial flow field, (H, W, 2) float32, covering all directions."""
    h, w = 32, 48
    ys, xs = np.mgrid[0:h, 0:w]
    u = (xs - w / 2) / 4.0
    v = (ys - h / 2) / 4.0
    return np.dstack([u, v]).astype(np.float32)


@pytest.fixture
def random_flow() -> np.ndarray:
    rng = np.random.default_rng(0)
    return (rng.standard_normal((16, 24, 2)) * 5).astype(np.float32)
