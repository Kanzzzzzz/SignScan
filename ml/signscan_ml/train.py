"""Training loop: AdamW, cosine LR, label smoothing, early stopping on validation macro-F1."""

from __future__ import annotations

import csv
import json
import random
import time
from datetime import datetime
from pathlib import Path

import numpy as np
import pandas as pd
import torch
import yaml
from sklearn.metrics import f1_score
from torch import nn

from signscan_ml.augment import augment_batch
from signscan_ml.config import TrainConfig
from signscan_ml.dataset import features_of
from signscan_ml.evaluate import evaluate_split
from signscan_ml.features import FEATURE_VERSION
from signscan_ml.models import build_model, count_parameters


def set_seed(seed: int) -> None:
    random.seed(seed)
    np.random.seed(seed)  # noqa: NPY002 (seeds third-party code that uses the global RNG)
    torch.manual_seed(seed)


def _macro_f1(model: nn.Module, x: np.ndarray, y: np.ndarray) -> float:
    if len(x) == 0:
        return 0.0
    model.eval()
    with torch.no_grad():
        pred = model(torch.tensor(x)).argmax(1).numpy()
    return float(f1_score(y, pred, average="macro", labels=np.unique(y), zero_division=0))


def train(
    cfg: TrainConfig,
    df: pd.DataFrame,
    splits: dict,
    labels: list[str],
    run_name: str | None = None,
    log=print,
) -> Path:
    set_seed(cfg.seed)
    rng = np.random.default_rng(cfg.seed)

    parts = {k: df[df["signer_id"].isin(splits.get(k, []))] for k in ("train", "val", "test")}
    if parts["train"].empty:
        raise ValueError("Training split is empty. Check splits.json and signer_ids.")
    overlap = set(splits.get("train", [])) & (
        set(splits.get("val", [])) | set(splits.get("test", []))
    )
    if overlap:
        raise ValueError(f"Signers appear in more than one split: {sorted(overlap)}")

    x_tr, y_tr = features_of(parts["train"]), parts["train"]["label_idx"].to_numpy()
    x_va, y_va = features_of(parts["val"]), parts["val"]["label_idx"].to_numpy()
    no_val = len(x_va) == 0
    if no_val:
        log("NOTE: no validation signers; early stopping uses training-data macro-F1.")
        x_va, y_va = x_tr, y_tr

    model = build_model(cfg.model, len(labels), cfg.dropout)
    opt = torch.optim.AdamW(model.parameters(), lr=cfg.lr, weight_decay=cfg.weight_decay)
    sched = torch.optim.lr_scheduler.CosineAnnealingLR(opt, T_max=max(1, cfg.epochs))
    loss_fn = nn.CrossEntropyLoss(label_smoothing=cfg.label_smoothing)

    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    run_dir = Path(cfg.runs_dir) / (run_name or f"{stamp}-{cfg.model}")
    run_dir.mkdir(parents=True, exist_ok=True)
    (run_dir / "config.yaml").write_text(yaml.safe_dump(cfg.to_dict(), sort_keys=False))
    (run_dir / "labels.json").write_text(json.dumps(labels))
    (run_dir / "splits.json").write_text(json.dumps(splits, indent=2))

    log(
        f"model={cfg.model} params={count_parameters(model):,} "
        f"train={len(x_tr)} val={len(parts['val'])} test={len(parts['test'])} classes={len(labels)}"
    )

    # Small datasets (a first recording session) need at least ~8 optimizer steps per epoch,
    # otherwise training is too short and BatchNorm statistics never settle.
    batch_size = min(cfg.batch_size, max(16, len(x_tr) // 8))
    if batch_size != cfg.batch_size:
        log(f"small dataset: using batch size {batch_size}")

    best_f1, best_epoch, bad = -1.0, 0, 0
    history = []
    t0 = time.time()
    for epoch in range(1, cfg.epochs + 1):
        model.train()
        perm = rng.permutation(len(x_tr))
        total = 0.0
        for i in range(0, len(perm), batch_size):
            idx = perm[i : i + batch_size]
            if len(idx) < 2:  # BatchNorm needs >1 sample
                continue
            xb = torch.from_numpy(augment_batch(x_tr[idx], rng, cfg.augment))
            yb = torch.from_numpy(y_tr[idx]).long()
            opt.zero_grad()
            loss = loss_fn(model(xb), yb)
            loss.backward()
            opt.step()
            total += loss.item() * len(idx)
        sched.step()
        train_loss = total / max(1, len(x_tr))
        val_f1 = _macro_f1(model, x_va, y_va)
        history.append({"epoch": epoch, "train_loss": train_loss, "val_macro_f1": val_f1})
        if val_f1 > best_f1:
            best_f1, best_epoch, bad = val_f1, epoch, 0
            torch.save(_checkpoint(model, cfg, labels, epoch, val_f1), run_dir / "model.pt")
        else:
            bad += 1
            # Without real validation signers the score is on training data and quickly ties at
            # its maximum; keep the latest (longest-trained) model among ties.
            if no_val and val_f1 >= best_f1:
                best_epoch = epoch
                torch.save(_checkpoint(model, cfg, labels, epoch, val_f1), run_dir / "model.pt")
        if epoch == 1 or epoch % 5 == 0:
            log(f"epoch {epoch:3d}  loss {train_loss:.4f}  val macro-F1 {val_f1:.4f}")
        if bad >= cfg.patience and epoch >= cfg.min_epochs:
            log(f"early stop at epoch {epoch} (best {best_epoch}, val macro-F1 {best_f1:.4f})")
            break

    with open(run_dir / "history.csv", "w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=["epoch", "train_loss", "val_macro_f1"])
        w.writeheader()
        w.writerows(history)

    model = load_checkpoint(run_dir / "model.pt")[0]
    results = {
        "model": cfg.model,
        "best_epoch": best_epoch,
        "train_seconds": round(time.time() - t0, 1),
        "params": count_parameters(model),
        "feature_version": FEATURE_VERSION,
    }
    for name in ("val", "test"):
        part = parts[name]
        m = evaluate_split(model, part, features_of(part), labels, run_dir, name)
        results[name] = {k: m[k] for k in ("n", "accuracy", "macro_f1") if k in m}
    (run_dir / "metrics.json").write_text(json.dumps(results, indent=2))
    log(f"done: {run_dir}")
    log(json.dumps({k: results[k] for k in ("val", "test")}, indent=2))
    return run_dir


def _checkpoint(model: nn.Module, cfg: TrainConfig, labels, epoch: int, val_f1: float) -> dict:
    return {
        "state_dict": model.state_dict(),
        "model": cfg.model,
        "dropout": cfg.dropout,
        "labels": labels,
        "epoch": epoch,
        "val_macro_f1": val_f1,
        "feature_version": FEATURE_VERSION,
    }


def load_checkpoint(path: Path) -> tuple[nn.Module, dict]:
    ckpt = torch.load(path, map_location="cpu", weights_only=False)
    if ckpt.get("feature_version") != FEATURE_VERSION:
        raise ValueError(
            f"Checkpoint feature_version {ckpt.get('feature_version')} != code {FEATURE_VERSION}"
        )
    model = build_model(ckpt["model"], len(ckpt["labels"]), ckpt.get("dropout", 0.3))
    model.load_state_dict(ckpt["state_dict"])
    model.eval()
    return model, ckpt
