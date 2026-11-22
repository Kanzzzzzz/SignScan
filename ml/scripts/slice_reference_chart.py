"""Slice the approved FSL manual-alphabet chart into Practice reference images.

python scripts/slice_reference_chart.py                       # default chart + output folder
python scripts/slice_reference_chart.py --chart other.png

The chart must be a grid of cells, 5 per row, letters A-Z in reading order. Grid lines are
detected automatically. Output: app/public/references/<LETTER>.jpg (480x480).
"""

from __future__ import annotations

import argparse
import string
import sys
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from signscan_ml.config import REPO_ROOT  # noqa: E402

DEFAULT_CHART = REPO_ROOT / "docs" / "assets" / "fsl_alphabet_chart.png"
DEFAULT_OUT = REPO_ROOT / "app" / "public" / "references"


def grid_lines(profile: np.ndarray, threshold: float) -> list[int]:
    """Centers of runs where the share of dark pixels exceeds `threshold`."""
    idx = np.where(profile > threshold)[0]
    runs: list[list[int]] = []
    for i in idx:
        if runs and i - runs[-1][-1] <= 2:
            runs[-1].append(int(i))
        else:
            runs.append([int(i)])
    return [round(sum(r) / len(r)) for r in runs]


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--chart", type=Path, default=DEFAULT_CHART)
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT)
    ap.add_argument("--cols", type=int, default=5)
    ap.add_argument("--size", type=int, default=480)
    ap.add_argument("--inset", type=int, default=4, help="pixels to trim inside each cell border")
    args = ap.parse_args()

    img = cv2.imread(str(args.chart))
    if img is None:
        print(f"Could not read {args.chart}")
        return 1
    dark = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) < 110
    xs = grid_lines(dark.mean(axis=0), 0.35)
    ys = grid_lines(dark.mean(axis=1), 0.35)
    rows_needed = -(-26 // args.cols)
    if len(xs) != args.cols + 1 or len(ys) < rows_needed + 1:
        print(f"Grid detection failed: {len(xs)} vertical, {len(ys)} horizontal lines")
        return 1

    args.out.mkdir(parents=True, exist_ok=True)
    for i, letter in enumerate(string.ascii_uppercase):
        r, c = divmod(i, args.cols)
        cell = img[
            ys[r] + args.inset : ys[r + 1] - args.inset + 1,
            xs[c] + args.inset : xs[c + 1] - args.inset + 1,
        ]
        h, w = cell.shape[:2]
        side = max(h, w)
        square = np.full((side, side, 3), 255, np.uint8)  # pad to a square on white
        y0, x0 = (side - h) // 2, (side - w) // 2
        square[y0 : y0 + h, x0 : x0 + w] = cell
        big = cv2.resize(square, (args.size, args.size), interpolation=cv2.INTER_CUBIC)
        sharp = cv2.addWeighted(big, 1.5, cv2.GaussianBlur(big, (0, 0), 2.0), -0.5, 0)
        cv2.imwrite(str(args.out / f"{letter}.jpg"), sharp, [cv2.IMWRITE_JPEG_QUALITY, 92])
    print(f"wrote 26 images to {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
