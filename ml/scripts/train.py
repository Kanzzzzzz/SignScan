"""Train a classifier on data/processed.

python scripts/train.py --config configs/default.yaml
python scripts/train.py --config configs/default.yaml --model mlp    # baseline
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from signscan_ml.config import TrainConfig, load_labels  # noqa: E402
from signscan_ml.dataset import load_processed  # noqa: E402
from signscan_ml.train import train  # noqa: E402


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--config", type=Path, default=None)
    ap.add_argument("--model", choices=["cnn", "mlp"], default=None)
    ap.add_argument("--epochs", type=int, default=None)
    ap.add_argument("--name", default=None, help="run folder name (default: timestamp-model)")
    args = ap.parse_args()

    cfg = TrainConfig.from_yaml(args.config)
    if args.model:
        cfg.model = args.model
    if args.epochs:
        cfg.epochs = args.epochs
    df, splits = load_processed(Path(cfg.data), Path(cfg.splits))
    train(cfg, df, splits, load_labels(), run_name=args.name)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
