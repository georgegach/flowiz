"""Compute EPE / Fl-score and save a prediction|ground-truth|error paper figure."""

from pathlib import Path

import numpy as np

import flowiz as fz

DEMO = Path(__file__).resolve().parent.parent / "demo" / "flo" / "frame_0001.flo"


def main() -> None:
    gt = fz.read(str(DEMO))
    # A fake prediction: ground truth plus mild noise.
    rng = np.random.default_rng(0)
    pred = gt.data + rng.standard_normal(gt.data.shape).astype("float32") * 0.5

    result = fz.epe(pred, gt)
    print(f"EPE mean {result.mean:.3f} px    Fl {fz.fl_score(pred, gt):.2f}%")

    fig = fz.compare_grid(pred, gt, save="paper_figure.png")
    print("Saved paper_figure.png")
    import matplotlib.pyplot as plt

    plt.close(fig)


if __name__ == "__main__":
    main()
