"""The ``Flow`` container and input normalization.

Every reader returns a :class:`Flow`; every public core function accepts a
``Flow``, a plain ``numpy`` array, or a torch tensor through :func:`as_flow`.
Inputs are always copied — v3 never mutates a caller's array (a v2 defect).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Optional

import numpy as np


@dataclass(frozen=True)
class Flow:
    """A dense 2D optical flow field.

    Attributes:
        data: ``(H, W, 2)`` float32 array, ``[..., 0]`` = u (horizontal),
            ``[..., 1]`` = v (vertical).
        valid: optional ``(H, W)`` bool mask of valid pixels. ``None`` means
            all pixels valid.
        source: provenance string (a file path, or ``"tensor"``/``"array"``).
    """

    data: np.ndarray
    valid: Optional[np.ndarray] = None
    source: Optional[str] = None

    def __post_init__(self) -> None:
        if self.data.ndim != 3 or self.data.shape[2] != 2:
            raise ValueError(
                f"Flow data must have shape (H, W, 2); got {self.data.shape}."
            )
        if self.valid is not None and self.valid.shape != self.data.shape[:2]:
            raise ValueError(
                f"valid mask {self.valid.shape} does not match flow "
                f"{self.data.shape[:2]}."
            )

    @property
    def u(self) -> np.ndarray:
        return self.data[..., 0]

    @property
    def v(self) -> np.ndarray:
        return self.data[..., 1]

    @property
    def shape(self) -> tuple[int, int]:
        return self.data.shape[0], self.data.shape[1]

    @property
    def height(self) -> int:
        return int(self.data.shape[0])

    @property
    def width(self) -> int:
        return int(self.data.shape[1])

    @property
    def magnitude(self) -> np.ndarray:
        """Per-pixel flow magnitude ``sqrt(u**2 + v**2)``."""
        return np.sqrt(self.u**2 + self.v**2)

    @property
    def angle(self) -> np.ndarray:
        """Per-pixel flow direction in radians, ``atan2(v, u)`` in ``[-pi, pi]``."""
        return np.arctan2(self.v, self.u)

    def max_magnitude(self) -> float:
        """Largest magnitude over valid pixels (0.0 for an empty field)."""
        mag = self.magnitude
        if self.valid is not None:
            mag = mag[self.valid]
        if mag.size == 0:
            return 0.0
        return float(np.max(mag))

    def __array__(self, dtype: Any = None) -> np.ndarray:
        return self.data.astype(dtype) if dtype is not None else self.data


def _to_numpy(x: Any) -> np.ndarray:
    """Coerce arrays / torch tensors to a numpy array (single coercion point)."""
    if isinstance(x, np.ndarray):
        return x
    # torch tensor duck-typing without importing torch.
    if hasattr(x, "detach") and hasattr(x, "cpu") and hasattr(x, "numpy"):
        return x.detach().cpu().numpy()
    return np.asarray(x)


def as_flow(x: Any, *, source: Optional[str] = None) -> Flow:
    """Normalize ``x`` into a :class:`Flow`.

    Accepts an existing :class:`Flow` (returned as-is), a numpy array, or a
    torch tensor. Arrays may be laid out as ``(H, W, 2)`` or ``(2, H, W)`` and
    are auto-transposed. The underlying data is always copied and cast to
    float32 so downstream code can never mutate the caller's buffer.
    """
    if isinstance(x, Flow):
        return x

    arr = _to_numpy(x)

    if arr.ndim == 3 and arr.shape[0] == 2 and arr.shape[2] != 2:
        # CHW -> HWC
        arr = np.transpose(arr, (1, 2, 0))
    elif arr.ndim == 3 and arr.shape[2] == 2:
        # Already HWC. (A 2x?x2 array is treated as HWC — leading dim is height.)
        pass
    else:
        raise ValueError(
            "Expected an array shaped (H, W, 2) or (2, H, W); got "
            f"{arr.shape}."
        )

    # Always copy (order="C" forces a fresh contiguous buffer) so downstream
    # code can never mutate the caller's array — a v2 defect.
    data = np.array(arr, dtype=np.float32, order="C")
    return Flow(data=data, source=source or "array")
