"""Evaluate a run on its test signers, or summarize a CSV exported by the app's Evaluate page.

python scripts/evaluate.py --run runs/<id>
python scripts/evaluate.py --app-csv signscan-eval-session.csv
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from signscan_ml.config import PROCESSED_DIR  # noqa: E402
from signscan_ml.dataset import features_of, load_processed  # noqa: E402
from signscan_ml.evaluate import evaluate_split, summarize_app_session  # noqa: E402
from signscan_ml.train import load_checkpoint  # noqa: E402


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--run", type=Path)
    ap.add_argument("--split", default="test", choices=["train", "val", "test"])
    ap.add_argument("--data", type=Path, default=PROCESSED_DIR / "dataset.parquet")
    ap.add_argument("--splits", type=Path, default=PROCESSED_DIR / "splits.json")
    ap.add_argument("--app-csv", type=Path, help="CSV exported from the app's Evaluate page")
    args = ap.parse_args()

    if args.app_csv:
        print(json.dumps(summarize_app_session(args.app_csv), indent=2, default=float))
        return 0
    if not args.run:
        ap.error("--run or --app-csv is required")

    model, ckpt = load_checkpoint(args.run / "model.pt")
    labels = ckpt["labels"]
    df, splits = load_processed(args.data, args.splits)
    part = df[df["signer_id"].isin(splits[args.split])]
    out = args.run / "eval"
    m = evaluate_split(model, part, features_of(part), labels, out, args.split)
    print(
        f"{args.split}: n={m.get('n')} accuracy={m.get('accuracy', 0):.4f} "
        f"macro-F1={m.get('macro_f1', 0):.4f}"
    )
    for col, groups in (m.get("per_condition") or {}).items():
        print(
            f"  {col}: "
            + ", ".join(f"{k}={v['accuracy']:.3f} (n={v['n']})" for k, v in groups.items())
        )
    print(f"reports in {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
