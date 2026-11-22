"""Validate JSONL samples, drop bad/duplicate frames, featurize, split by signer, save parquet.

python scripts/build_dataset.py --raw ../data/raw --out ../data/processed

(To build, train and export in one go, use scripts/pipeline.py.)
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import pandas as pd  # noqa: E402

from signscan_ml.config import PROCESSED_DIR, RAW_DIR, load_labels  # noqa: E402
from signscan_ml.dataset import count_table  # noqa: E402
from signscan_ml.pipeline import PipelineError, build_dataset  # noqa: E402


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--raw", type=Path, default=RAW_DIR, help="folder of *.jsonl files")
    ap.add_argument("--out", type=Path, default=PROCESSED_DIR)
    ap.add_argument("--min-score", type=float, default=0.7)
    ap.add_argument("--val-frac", type=float, default=0.1)
    ap.add_argument("--test-frac", type=float, default=0.2)
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument(
        "--test-signers", nargs="*", default=None, help="explicit held-out test signer IDs"
    )
    args = ap.parse_args()

    labels = load_labels()
    try:
        df, splits, _ = build_dataset(
            args.raw, args.out, labels, args.min_score, args.val_frac, args.test_frac,
            args.seed, args.test_signers,
        )  # fmt: skip
    except PipelineError as e:
        print(e)
        return 1

    with pd.option_context(
        "display.max_rows", 100, "display.max_columns", 30, "display.width", 160
    ):
        print("\nSamples per letter x signer:")
        print(count_table(df, labels, "signer_id"))
        print("\nSamples per letter x lighting:")
        print(count_table(df, labels, "lighting"))
    missing = [lab for lab in labels if lab not in set(df["label"])]
    if missing:
        print(f"\nWARNING: no samples for {missing}")
    print(f"\nsplits (by signer): {splits}")
    print(f"wrote {args.out / 'dataset.parquet'} and {args.out / 'splits.json'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
