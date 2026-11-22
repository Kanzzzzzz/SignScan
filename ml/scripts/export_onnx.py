"""Export a run to ONNX, check parity against PyTorch, and copy into the app.

python scripts/export_onnx.py --run runs/<id>
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from signscan_ml.config import APP_MODELS_DIR, PROCESSED_DIR, load_labels  # noqa: E402
from signscan_ml.dataset import features_of, load_processed  # noqa: E402
from signscan_ml.export import export_run  # noqa: E402
from signscan_ml.train import load_checkpoint  # noqa: E402


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--run", type=Path, required=True)
    ap.add_argument("--out", type=Path, default=APP_MODELS_DIR)
    ap.add_argument("--data", type=Path, default=PROCESSED_DIR / "dataset.parquet")
    ap.add_argument("--splits", type=Path, default=PROCESSED_DIR / "splits.json")
    args = ap.parse_args()

    model, ckpt = load_checkpoint(args.run / "model.pt")
    labels = ckpt["labels"]
    if labels != load_labels():
        print("WARNING: run labels differ from shared/labels.json; exporting the run's labels.")

    # Parity on the test split (falls back to all data, then to random inputs).
    x = np.zeros((0, 63), dtype=np.float32)
    if args.data.exists() and args.splits.exists():
        df, splits = load_processed(args.data, args.splits)
        part = df[df["signer_id"].isin(splits.get("test", []))]
        x = features_of(part if len(part) else df)
    if len(x) == 0:
        x = np.random.default_rng(0).normal(0, 1, (512, 63)).astype(np.float32)

    metrics_path = args.run / "metrics.json"
    metrics = json.loads(metrics_path.read_text()) if metrics_path.exists() else {}
    meta = export_run(model, labels, x, args.out, metrics, run_id=args.run.name)
    print(f"parity: {meta['parity']}")
    print(f"wrote {args.out / 'signscan.onnx'}, labels.json, model_meta.json")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
