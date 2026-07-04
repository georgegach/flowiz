"""Read a KITTI 16-bit flow PNG (with validity mask) and visualize it.

KITTI stores flow as uint16: flow = (value - 2**15) / 64, with channel 3 the
validity mask. flowiz handles the decode; invalid pixels render black.
"""

from pathlib import Path

import numpy as np
from PIL import Image

import flowiz as fz

# Synthesize a tiny KITTI PNG so the example is self-contained.
tmp = Path("kitti_sample.png")
ys, xs = np.mgrid[0:64, 0:96]
data = np.dstack([(xs - 48) / 6.0, (ys - 32) / 6.0]).astype(np.float32)
valid = np.ones((64, 96), dtype=bool)
valid[:10, :] = False  # top strip invalid
fz.write(fz.Flow(data=data, valid=valid), str(tmp))


def main() -> None:
    flow = fz.read(str(tmp))
    print(f"valid pixels: {int(flow.valid.sum())} / {flow.valid.size}")
    img = fz.colorize(flow, mask_invalid=True)
    Image.fromarray(img).save("kitti_vis.png")
    print("Saved kitti_vis.png (invalid strip is black)")


if __name__ == "__main__":
    main()
