"""Compile a flow sequence into a flicker-free MP4.

Sequence-wide normalization keeps colors stable across frames so the video shows
motion, not brightness flicker.
"""

import glob
from pathlib import Path

import flowiz as fz

DEMO_DIR = Path(__file__).resolve().parent.parent / "demo" / "flo"


def main() -> None:
    files = sorted(glob.glob(str(DEMO_DIR / "*.flo")))
    out = fz.write_video(files, "sequence.mp4", fps=4, normalize="sequence")
    print(f"Wrote {out} from {len(files)} frames")


if __name__ == "__main__":
    main()
