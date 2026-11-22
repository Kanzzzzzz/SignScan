"""One-shot pipeline: raw JSONL -> processed dataset -> trained model -> ONNX in the app.

Used by `scripts/pipeline.py` and by the app's "Train model" button (dev server).
"""

from __future__ import annotations

import json
from collections.abc import Callable
from pathlib import Path

import pandas as pd

from signscan_ml.config import APP_MODELS_DIR, PROCESSED_DIR, RAW_DIR, TrainConfig, load_labels
from signscan_ml.dataset import BuildReport, features_of, load_samples, save_processed, signer_split
from signscan_ml.export import export_run
from signscan_ml.train import load_checkpoint, train

Log = Callable[[str], None]


class PipelineError(RuntimeError):
    """A problem the user can fix (no data, too few letters...)."""


def build_dataset(
    raw_dir: Path,
    out_dir: Path,
    labels: list[str],
    min_score: float = 0.7,
    val_frac: float = 0.1,
    test_frac: float = 0.2,
    seed: int = 42,
    test_signers: list[str] | None = None,
    log: Log = print,
) -> tuple[pd.DataFrame, dict, BuildReport]:
    paths = sorted(Path(raw_dir).glob("**/*.jsonl"))
    if not paths:
        raise PipelineError(f"No .jsonl files under {raw_dir}. Record letters on the Collect page.")
    df, rep = load_samples(paths, labels, min_score)
    log(
        f"files: {len(paths)}  kept: {rep.kept}  invalid: {rep.dropped_invalid}  "
        f"low-score: {rep.dropped_low_score}  duplicates: {rep.dropped_duplicate}"
    )
    for e in rep.errors:
        log(f"  ! {e}")
    if df.empty:
        raise PipelineError("No usable samples after filtering.")

    signers = df["signer_id"].unique().tolist()
    if test_signers:
        test = sorted(set(test_signers) & set(signers))
        rest = [s for s in signers if s not in test]
        inner = signer_split(rest, val_frac=val_frac / (1 - test_frac), test_frac=0, seed=seed)
        splits = {"train": inner["train"] + inner["test"], "val": inner["val"], "test": test}
    else:
        splits = signer_split(signers, val_frac, test_frac, seed)
    if len(signers) < 3:
        log("NOTE: fewer than 3 signers, so accuracy is not measured on unseen signers.")
    save_processed(df, splits, Path(out_dir))
    return df, splits, rep


def run_pipeline(
    raw_dir: Path = RAW_DIR,
    processed_dir: Path = PROCESSED_DIR,
    out_dir: Path = APP_MODELS_DIR,
    config: Path | None = None,
    model: str | None = None,
    epochs: int | None = None,
    runs_dir: Path | None = None,
    min_letters: int = 2,
    log: Log = print,
) -> dict:
    labels = load_labels()

    log("[1/3] Building dataset")
    df, splits, rep = build_dataset(raw_dir, processed_dir, labels, log=log)
    present = [lab for lab in labels if lab in set(df["label"])]
    missing = [lab for lab in labels if lab not in present]
    if len(present) < min_letters:
        raise PipelineError(
            f"Only {len(present)} letter(s) recorded. Record at least {min_letters} different "
            "letters before training."
        )
    if missing:
        log(f"NOTE: no samples yet for {' '.join(missing)}. These won't be recognized.")

    log("[2/3] Training")
    cfg = TrainConfig.from_yaml(config)
    cfg.data = str(Path(processed_dir) / "dataset.parquet")
    cfg.splits = str(Path(processed_dir) / "splits.json")
    if model:
        cfg.model = model
    if epochs:
        cfg.epochs = epochs
    if runs_dir:
        cfg.runs_dir = str(runs_dir)
    run = train(cfg, df, splits, labels, log=log)

    log("[3/3] Exporting to the app")
    net, ckpt = load_checkpoint(run / "model.pt")
    test = df[df["signer_id"].isin(splits.get("test", []))]
    parity_x = features_of(test if len(test) else df)
    metrics = json.loads((run / "metrics.json").read_text())
    meta = export_run(net, ckpt["labels"], parity_x, Path(out_dir), metrics, run_id=run.name)

    return {
        "run_id": run.name,
        "samples": int(len(df)),
        "signers": sorted(df["signer_id"].unique().tolist()),
        "letters_trained": present,
        "letters_missing": missing,
        "val": metrics.get("val", {}),
        "test": metrics.get("test", {}),
        "parity_passed": meta["parity"]["passed"],
        "dropped_low_score": rep.dropped_low_score,
    }
