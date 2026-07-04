"""Visualize a model's optical flow output given as a torch tensor.

RAFT-style models return flow as a (2, H, W) or (N, 2, H, W) tensor. Pass it
straight to flowiz via `from_tensor`; no manual reshaping.
"""

from PIL import Image

import flowiz as fz


def fake_model_output():
    """Stand-in for `model(image_pair)` -> torch.Tensor of shape (2, H, W)."""
    try:
        import torch

        h, w = 128, 192
        yy, xx = torch.meshgrid(torch.arange(h), torch.arange(w), indexing="ij")
        u = (xx - w / 2) / 8.0
        v = (yy - h / 2) / 8.0
        return torch.stack([u, v], dim=0).float()
    except ImportError:
        import numpy as np

        h, w = 128, 192
        yy, xx = np.mgrid[0:h, 0:w]
        return np.stack([(xx - w / 2) / 8.0, (yy - h / 2) / 8.0]).astype("float32")


def main() -> None:
    tensor = fake_model_output()
    flow = fz.from_tensor(tensor)  # (2, H, W) -> Flow
    img = fz.colorize(flow)
    Image.fromarray(img).save("raft_vis.png")
    print(f"Saved raft_vis.png from a {flow.width}x{flow.height} tensor")


if __name__ == "__main__":
    main()
