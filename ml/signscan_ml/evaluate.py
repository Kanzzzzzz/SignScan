"""Chapter 4 metrics: accuracy, macro P/R/F1, per-class, per-condition, confusion, latency."""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd
import torch
from sklearn.metrics import (
    accuracy_score,
    confusion_matrix,
    precision_recall_fscore_support,
)

CONDITION_COLS = ("lighting", "background", "distance", "orientation")


@torch.no_grad()
def predict_proba(model: torch.nn.Module, x: np.ndarray, batch_size: int = 2048) -> np.ndarray:
    model.eval()
    out = []
    for i in range(0, len(x), batch_size):
        logits = model(torch.tensor(x[i : i + batch_size], dtype=torch.float32))
        out.append(torch.softmax(logits, dim=1).cpu().numpy())
    return np.concatenate(out) if out else np.zeros((0, 0), dtype=np.float32)


def compute_metrics(y_true: np.ndarray, y_pred: np.ndarray, labels: list[str]) -> dict:
    idx = list(range(len(labels)))
    p, r, f, support = precision_recall_fscore_support(y_true, y_pred, labels=idx, zero_division=0)
    present = support > 0
    per_class = [
        {
            "label": labels[i],
            "precision": float(p[i]),
            "recall": float(r[i]),
            "f1": float(f[i]),
            "support": int(support[i]),
        }
        for i in idx
    ]
    return {
        "n": int(len(y_true)),
        "accuracy": float(accuracy_score(y_true, y_pred)) if len(y_true) else 0.0,
        # Macro averages over classes that actually appear in this split.
        "macro_precision": float(p[present].mean()) if present.any() else 0.0,
        "macro_recall": float(r[present].mean()) if present.any() else 0.0,
        "macro_f1": float(f[present].mean()) if present.any() else 0.0,
        "per_class": per_class,
    }


def per_condition_accuracy(df: pd.DataFrame, y_pred: np.ndarray) -> dict[str, dict[str, dict]]:
    correct = df["label_idx"].to_numpy() == y_pred
    out: dict[str, dict[str, dict]] = {}
    for col in CONDITION_COLS:
        if col not in df.columns:
            continue
        groups = {}
        for value, mask in df.groupby(col).indices.items():
            groups[str(value)] = {"n": int(len(mask)), "accuracy": float(correct[mask].mean())}
        out[col] = groups
    return out


def plot_confusion(y_true: np.ndarray, y_pred: np.ndarray, labels: list[str], path: Path) -> None:
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    cm = confusion_matrix(y_true, y_pred, labels=list(range(len(labels))))
    with np.errstate(invalid="ignore", divide="ignore"):
        norm = cm / cm.sum(axis=1, keepdims=True)
    norm = np.nan_to_num(norm)
    fig, ax = plt.subplots(figsize=(10, 9))
    im = ax.imshow(norm, cmap="Blues", vmin=0, vmax=1)
    ax.set_xticks(range(len(labels)), labels)
    ax.set_yticks(range(len(labels)), labels)
    ax.set_xlabel("Predicted")
    ax.set_ylabel("True")
    ax.set_title("Confusion matrix (row-normalized)")
    for i in range(len(labels)):
        for j in range(len(labels)):
            if cm[i, j]:
                ax.text(
                    j,
                    i,
                    str(cm[i, j]),
                    ha="center",
                    va="center",
                    fontsize=6,
                    color="white" if norm[i, j] > 0.5 else "black",
                )
    fig.colorbar(im, ax=ax, fraction=0.046)
    fig.tight_layout()
    fig.savefig(path, dpi=150)
    plt.close(fig)


def evaluate_split(
    model: torch.nn.Module,
    df: pd.DataFrame,
    x: np.ndarray,
    labels: list[str],
    out_dir: Path | None = None,
    name: str = "test",
) -> dict:
    if len(df) == 0:
        return {"n": 0}
    probs = predict_proba(model, x)
    y_pred = probs.argmax(axis=1)
    y_true = df["label_idx"].to_numpy()
    metrics = compute_metrics(y_true, y_pred, labels)
    metrics["per_condition"] = per_condition_accuracy(df, y_pred)
    metrics["signers"] = sorted(df["signer_id"].unique().tolist())
    if out_dir is not None:
        out_dir.mkdir(parents=True, exist_ok=True)
        plot_confusion(y_true, y_pred, labels, out_dir / f"confusion_{name}.png")
        pd.DataFrame(metrics["per_class"]).to_csv(out_dir / f"per_class_{name}.csv", index=False)
        (out_dir / f"metrics_{name}.json").write_text(json.dumps(metrics, indent=2))
    return metrics


def summarize_latency(csv_path: Path) -> pd.DataFrame:
    """Summarize a latency/evaluation CSV exported by the app's Evaluate page.

    Expects columns like detect_ms, feature_ms, infer_ms, total_ms. Reports mean and p95.
    """
    df = pd.read_csv(csv_path)
    cols = [c for c in df.columns if c.endswith("_ms")]
    rows = []
    for c in cols:
        v = pd.to_numeric(df[c], errors="coerce").dropna()
        if len(v):
            rows.append(
                {
                    "stage": c,
                    "mean_ms": v.mean(),
                    "p95_ms": v.quantile(0.95),
                    "max_ms": v.max(),
                    "n": len(v),
                }
            )
    return pd.DataFrame(rows)


def summarize_app_session(csv_path: Path) -> dict:
    """Accuracy per letter and per condition from an Evaluate-page session CSV."""
    df = pd.read_csv(csv_path)
    out: dict = {}
    if {"target", "predicted"} <= set(df.columns):
        df["correct"] = df["target"].astype(str) == df["predicted"].astype(str)
        out["accuracy"] = float(df["correct"].mean())
        out["per_letter"] = df.groupby("target")["correct"].mean().to_dict()
        for col in CONDITION_COLS:
            if col in df.columns:
                out[f"per_{col}"] = df.groupby(col)["correct"].mean().to_dict()
    out["latency"] = summarize_latency(csv_path).to_dict(orient="records")
    return out
