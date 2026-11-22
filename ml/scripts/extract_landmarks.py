"""Extract landmarks from an image dataset into SignScan JSONL (same schema as the Collect page).

Expected layout: <root>/<LETTER>/*.jpg|png   (one folder per letter)

    python scripts/extract_landmarks.py --images path/to/dataset --signer public01 \
        --out ../data/raw/public01.jsonl

Only use a public dataset if its letters match the chosen alphabet (docs/decisions.md G1)
and its license allows it.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import cv2  # noqa: E402

from signscan_ml.config import load_labels  # noqa: E402
from signscan_ml.features import FEATURE_VERSION  # noqa: E402
from signscan_ml.landmarker import HandTracker  # noqa: E402

IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--images", type=Path, required=True)
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--signer", required=True, help="signer_id to record (use one per source)")
    ap.add_argument("--session", default="extracted")
    ap.add_argument("--mirrored", action="store_true", help="images are already mirrored selfies")
    args = ap.parse_args()

    labels = set(load_labels())
    args.out.parent.mkdir(parents=True, exist_ok=True)
    n_ok = n_miss = n_skip = 0
    with HandTracker("image") as tracker, open(args.out, "w", encoding="utf-8") as fh:
        for letter_dir in sorted(p for p in args.images.iterdir() if p.is_dir()):
            letter = letter_dir.name.upper()
            if letter not in labels:
                n_skip += 1
                continue
            for img_path in sorted(letter_dir.iterdir()):
                if img_path.suffix.lower() not in IMAGE_EXTS:
                    continue
                bgr = cv2.imread(str(img_path))
                if bgr is None:
                    continue
                rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
                res = tracker.detect(rgb)
                if res is None:
                    n_miss += 1
                    continue
                hand = res.handedness
                if args.mirrored:  # tracker assumed raw frames; undo its swap
                    hand = "Left" if hand == "Right" else "Right"
                h, w = rgb.shape[:2]
                fh.write(
                    json.dumps(
                        {
                            "label": letter,
                            "signer_id": args.signer,
                            "session": args.session,
                            "burst_id": f"{letter}-{img_path.stem}",
                            "conditions": {},
                            "landmarks": res.landmarks.round(6).tolist(),
                            "handedness": hand,
                            "handedness_score": round(res.score, 4),
                            "image_width": w,
                            "image_height": h,
                            "ts": int(time.time() * 1000),
                            "feature_version": FEATURE_VERSION,
                            "source": str(img_path.name),
                        }
                    )
                    + "\n"
                )
                n_ok += 1
    print(f"extracted {n_ok}, no hand {n_miss}, skipped folders {n_skip} -> {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
