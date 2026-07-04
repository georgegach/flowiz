"""Read a .flo file, colorize it, and save a PNG."""

from pathlib import Path

from PIL import Image

import flowiz as fz

DEMO = Path(__file__).resolve().parent.parent / "demo" / "flo" / "frame_0001.flo"


def main() -> None:
    flow = fz.read(str(DEMO))
    print(f"Loaded {flow.width}x{flow.height} flow, max magnitude {flow.max_magnitude():.2f} px")

    img = fz.colorize(flow, legend=True)
    out = Path("frame_0001.png")
    Image.fromarray(img).save(out)
    print(f"Saved {out.resolve()}")


if __name__ == "__main__":
    main()
