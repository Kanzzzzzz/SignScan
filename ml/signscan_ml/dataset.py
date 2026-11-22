"""JSONL sample loading, validation, signer-based splits and parquet I/O.

JSONL sample schema (one object per line, as exported by the app's Collect page):
    label, signer_id, session, conditions{lighting, background, distance, ...},
    landmarks[21][3], handedness ("Left"/"Right", the signer's actual hand),
    handedness_score, image_width, image_height, ts, feature_version, burst_id (optional)
"""

from __future__ import annotations

import json
from collections.abc import Iterable
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import pandas as pd

from signscan_ml.config import FEATURE_DIM
from signscan_ml.features import FEATURE_VERSION, normalize_landmarks

REQUIRED_FIELDS = ("label", "signer_id", "landmarks", "handedness", "image_width", "image_height")
FEATURE_COLS = [f"f{i}" for i in range(FEATURE_DIM)]


class SampleError(ValueError):
    pass


def validate_sample(s: dict, labels: set[str]) -> None:
    missing = [k for k in REQUIRED_FIELDS if k not in s]
    if missing:
        raise SampleError(f"missing fields {missing}")
    if s["label"] not in labels:
        raise SampleError(f"label {s['label']!r} not in shared/labels.json")
    lm = s["landmarks"]
    if not (isinstance(lm, list) and len(lm) == 21 and all(len(p) == 3 for p in lm)):
        raise SampleError("landmarks must be 21 x [x, y, z]")
    if not np.all(np.isfinite(np.asarray(lm, dtype=np.float64))):
        raise SampleError("landmarks contain NaN/inf")
    if s["handedness"] not in ("Left", "Right"):
        raise SampleError(f"bad handedness {s['handedness']!r}")
    if s["image_width"] <= 0 or s["image_height"] <= 0:
        raise SampleError("image size must be positive")
    fv = s.get("feature_version", FEATURE_VERSION)
    if fv != FEATURE_VERSION:
        # Raw landmarks are stored, so features are always recomputed; just note it.
        pass


def iter_jsonl(paths: Iterable[Path]) -> Iterable[tuple[Path, int, dict]]:
    for path in paths:
        with open(path, encoding="utf-8") as fh:
            for lineno, line in enumerate(fh, 1):
                line = line.strip()
                if not line:
                    continue
                try:
                    yield path, lineno, json.loads(line)
                except json.JSONDecodeError as e:
                    raise SampleError(f"{path}:{lineno}: invalid JSON ({e})") from e


@dataclass
class BuildReport:
    kept: int
    dropped_invalid: int
    dropped_low_score: int
    dropped_duplicate: int
    errors: list[str]


def load_samples(
    paths: Iterable[Path], labels: list[str], min_score: float = 0.7
) -> tuple[pd.DataFrame, BuildReport]:
    """Validate, filter and featurize JSONL samples into a DataFrame."""
    label_set = set(labels)
    rows: list[dict] = []
    errors: list[str] = []
    invalid = low = dup = 0
    seen: set[tuple] = set()
    for path, lineno, s in iter_jsonl(paths):
        try:
            validate_sample(s, label_set)
        except SampleError as e:
            invalid += 1
            if len(errors) < 20:
                errors.append(f"{path.name}:{lineno}: {e}")
            continue
        if float(s.get("handedness_score", 1.0)) < min_score:
            low += 1
            continue
        key = (str(s["signer_id"]), s["label"], tuple(np.round(np.ravel(s["landmarks"]), 6)))
        if key in seen:
            dup += 1
            continue
        seen.add(key)
        feat = normalize_landmarks(
            s["landmarks"], s["handedness"], s["image_width"], s["image_height"]
        )
        cond = s.get("conditions") or {}
        row = {
            "label": s["label"],
            "label_idx": labels.index(s["label"]),
            "signer_id": str(s["signer_id"]),
            "session": str(s.get("session", "")),
            "burst_id": str(s.get("burst_id", "")),
            "handedness": s["handedness"],
            "lighting": str(cond.get("lighting", "unknown")),
            "background": str(cond.get("background", "unknown")),
            "distance": str(cond.get("distance", "unknown")),
            "orientation": str(cond.get("orientation", "unknown")),
            "source": path.name,
        }
        row.update({c: float(v) for c, v in zip(FEATURE_COLS, feat, strict=True)})
        rows.append(row)
    df = pd.DataFrame(rows)
    return df, BuildReport(len(df), invalid, low, dup, errors)


def signer_split(
    signers: list[str], val_frac: float = 0.1, test_frac: float = 0.2, seed: int = 42
) -> dict[str, list[str]]:
    """Split by SIGNER, never by sample. Train always gets >=1 signer; val/test when possible."""
    uniq = sorted(set(signers))
    if not uniq:
        raise ValueError("no signers")
    rng = np.random.default_rng(seed)
    order = list(rng.permutation(uniq))
    n = len(order)
    n_test = max(1, round(n * test_frac)) if n >= 3 else 0
    n_val = max(1, round(n * val_frac)) if n >= 3 else (1 if n == 2 else 0)
    if n_test + n_val >= n:
        n_test = max(0, min(n_test, n - 2))
        n_val = max(0, min(n_val, n - 1 - n_test))
    test = order[:n_test]
    val = order[n_test : n_test + n_val]
    train = order[n_test + n_val :]
    return {"train": sorted(train), "val": sorted(val), "test": sorted(test)}


def kfold_signers(signers: list[str], k: int, seed: int = 42) -> list[list[str]]:
    uniq = sorted(set(signers))
    rng = np.random.default_rng(seed)
    order = list(rng.permutation(uniq))
    return [sorted(order[i::k]) for i in range(k)]


def features_of(df: pd.DataFrame) -> np.ndarray:
    return df[FEATURE_COLS].to_numpy(dtype=np.float32)


def count_table(df: pd.DataFrame, labels: list[str], by: str = "signer_id") -> pd.DataFrame:
    if df.empty:
        return pd.DataFrame(index=labels)
    t = pd.crosstab(df["label"], df[by]).reindex(labels, fill_value=0)
    t["TOTAL"] = t.sum(axis=1)
    return t


def save_processed(df: pd.DataFrame, splits: dict, out_dir: Path) -> tuple[Path, Path]:
    out_dir.mkdir(parents=True, exist_ok=True)
    data_path = out_dir / "dataset.parquet"
    split_path = out_dir / "splits.json"
    df.to_parquet(data_path, index=False)
    split_path.write_text(
        json.dumps({**splits, "feature_version": FEATURE_VERSION}, indent=2), encoding="utf-8"
    )
    return data_path, split_path


def load_processed(data_path: Path, split_path: Path) -> tuple[pd.DataFrame, dict]:
    df = pd.read_parquet(data_path)
    splits = json.loads(Path(split_path).read_text(encoding="utf-8"))
    fv = splits.get("feature_version", FEATURE_VERSION)
    if fv != FEATURE_VERSION:
        raise ValueError(
            f"Processed data has feature_version {fv}, code is {FEATURE_VERSION}. "
            "Re-run scripts/build_dataset.py."
        )
    return df, splits
