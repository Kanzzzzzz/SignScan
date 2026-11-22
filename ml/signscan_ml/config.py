"""Paths, the canonical label set and training hyperparameters."""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field, fields
from pathlib import Path
from typing import Any

import yaml

ML_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = ML_ROOT.parent
SHARED_DIR = REPO_ROOT / "shared"
LABELS_PATH = SHARED_DIR / "labels.json"
FIXTURES_DIR = SHARED_DIR / "fixtures"
DATA_DIR = REPO_ROOT / "data"
RAW_DIR = DATA_DIR / "raw"
PROCESSED_DIR = DATA_DIR / "processed"
RUNS_DIR = ML_ROOT / "runs"
APP_MODELS_DIR = REPO_ROOT / "app" / "public" / "models"
HAND_LANDMARKER_PATH = APP_MODELS_DIR / "hand_landmarker.task"

NUM_LANDMARKS = 21
NUM_COORDS = 3
FEATURE_DIM = NUM_LANDMARKS * NUM_COORDS


def load_labels(path: Path = LABELS_PATH) -> list[str]:
    """Class list from shared/labels.json, the single source of truth."""
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    labels = data["labels"]
    if len(labels) != len(set(labels)):
        raise ValueError(f"Duplicate labels in {path}")
    return list(labels)


@dataclass
class TrainConfig:
    model: str = "cnn"  # "cnn" or "mlp"
    data: str = str(PROCESSED_DIR / "dataset.parquet")
    splits: str = str(PROCESSED_DIR / "splits.json")
    epochs: int = 80
    batch_size: int = 256
    lr: float = 2e-3
    weight_decay: float = 1e-4
    label_smoothing: float = 0.05
    dropout: float = 0.3
    patience: int = 12
    min_epochs: int = 30  # never early-stop before this
    seed: int = 42
    num_workers: int = 0
    augment: dict[str, Any] = field(
        default_factory=lambda: {
            "rotate_deg": 15.0,
            "scale": 0.10,
            "jitter_std": 0.02,
            "mirror_p": 0.1,
            "landmark_dropout_p": 0.05,
        }
    )
    runs_dir: str = str(RUNS_DIR)

    @classmethod
    def from_yaml(cls, path: str | Path | None) -> TrainConfig:
        if path is None:
            return cls()
        raw = yaml.safe_load(Path(path).read_text(encoding="utf-8")) or {}
        known = {f.name for f in fields(cls)}
        unknown = set(raw) - known
        if unknown:
            raise ValueError(f"Unknown config keys in {path}: {sorted(unknown)}")
        cfg = cls(**{k: v for k, v in raw.items() if k != "augment"})
        if "augment" in raw:
            cfg.augment = {**cfg.augment, **(raw["augment"] or {})}
        # Relative paths in the YAML are relative to ml/.
        for key in ("data", "splits", "runs_dir"):
            p = Path(getattr(cfg, key))
            if not p.is_absolute():
                setattr(cfg, key, str((ML_ROOT / p).resolve()))
        return cfg

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)
