"""Dataset, augmentation, models, training and ONNX export on small synthetic data."""

from __future__ import annotations

import json

import numpy as np
import pytest
import torch

from signscan_ml.augment import augment_batch
from signscan_ml.config import TrainConfig
from signscan_ml.dataset import (
    features_of,
    kfold_signers,
    load_processed,
    load_samples,
    save_processed,
    signer_split,
)
from signscan_ml.export import export_run
from signscan_ml.models import LandmarkCNN, build_model, count_parameters
from signscan_ml.train import load_checkpoint, train

LABELS = ["A", "B", "C", "D"]


def test_signer_split_has_no_overlap():
    signers = [f"s{i:02d}" for i in range(10)]
    sp = signer_split(signers, 0.1, 0.2, seed=1)
    all_ = sp["train"] + sp["val"] + sp["test"]
    assert sorted(all_) == sorted(signers)
    assert len(set(all_)) == len(all_)
    assert len(sp["test"]) == 2 and len(sp["val"]) == 1


@pytest.mark.parametrize("n", [1, 2, 3])
def test_signer_split_small(n):
    sp = signer_split([f"s{i}" for i in range(n)])
    assert sp["train"], "train must never be empty"


def test_kfold_covers_all_signers():
    folds = kfold_signers([f"s{i}" for i in range(7)], 3)
    assert sorted(sum(folds, [])) == [f"s{i}" for i in range(7)]


def test_load_samples_filters(jsonl_dir, tmp_path):
    d = jsonl_dir(LABELS, ["s1"], per_class=5)
    bad = d / "bad.jsonl"
    good = json.loads((d / "samples.jsonl").read_text().splitlines()[0])
    rows = [
        {**good, "label": "Z"},  # not in label set
        {**good, "handedness_score": 0.2},  # low score
        good,  # duplicate
        {**good, "landmarks": good["landmarks"][:20]},  # wrong shape
    ]
    bad.write_text("\n".join(json.dumps(r) for r in rows))
    df, rep = load_samples(sorted(d.glob("*.jsonl")), LABELS)
    assert rep.kept == 20
    assert rep.dropped_invalid == 2 and rep.dropped_low_score == 1 and rep.dropped_duplicate == 1
    assert features_of(df).shape == (20, 63)


def test_augment_keeps_wrist_and_shape():
    rng = np.random.default_rng(0)
    x = rng.normal(size=(16, 63)).astype(np.float32)
    x.reshape(16, 21, 3)[:, 0] = 0
    y = augment_batch(x, rng, TrainConfig().augment)
    assert y.shape == x.shape
    np.testing.assert_allclose(y.reshape(16, 21, 3)[:, 0], 0, atol=1e-6)
    assert not np.allclose(x, y)


def test_models_output_shape():
    for name in ("cnn", "mlp"):
        m = build_model(name, 24).eval()
        assert m(torch.zeros(5, 63)).shape == (5, 24)
    assert 50_000 < count_parameters(LandmarkCNN(24)) < 150_000


def test_train_and_export_end_to_end(jsonl_dir, tmp_path):
    d = jsonl_dir(LABELS, ["s1", "s2", "s3", "s4"], per_class=40)
    df, _ = load_samples(sorted(d.glob("*.jsonl")), LABELS)
    splits = {"train": ["s1", "s2"], "val": ["s3"], "test": ["s4"]}
    data_path, split_path = save_processed(df, splits, tmp_path / "processed")
    df, splits = load_processed(data_path, split_path)

    cfg = TrainConfig(epochs=25, batch_size=64, patience=25, runs_dir=str(tmp_path / "runs"))
    run = train(cfg, df, splits, LABELS, run_name="t", log=lambda *_: None)
    metrics = json.loads((run / "metrics.json").read_text())
    assert metrics["test"]["accuracy"] > 0.9, metrics
    assert (run / "confusion_test.png").exists()

    model, ckpt = load_checkpoint(run / "model.pt")
    x = features_of(df[df["signer_id"] == "s4"])
    meta = export_run(model, ckpt["labels"], x, tmp_path / "app_models", metrics, "t")
    assert meta["parity"]["passed"]
    assert json.loads((tmp_path / "app_models" / "labels.json").read_text()) == LABELS


def test_run_pipeline_one_signer_partial_letters(jsonl_dir, tmp_path):
    """The app's Train button case: one signer, only some letters recorded."""
    from signscan_ml.config import load_labels
    from signscan_ml.pipeline import run_pipeline

    labels = load_labels()
    raw = jsonl_dir(labels[:5], ["me"], per_class=30)
    out = tmp_path / "models"
    result = run_pipeline(
        raw, tmp_path / "processed", out, epochs=15, runs_dir=tmp_path / "runs", log=lambda _: None
    )
    assert result["parity_passed"]
    assert result["letters_trained"] == labels[:5]
    assert len(result["letters_missing"]) == len(labels) - 5
    assert (out / "signscan.onnx").exists()
    assert json.loads((out / "labels.json").read_text()) == labels


def test_run_pipeline_needs_two_letters(jsonl_dir, tmp_path):
    from signscan_ml.pipeline import PipelineError, run_pipeline

    raw = jsonl_dir(["A"], ["me"], per_class=10)
    with pytest.raises(PipelineError, match="at least 2"):
        run_pipeline(raw, tmp_path / "p", tmp_path / "m", log=lambda _: None)


def test_train_rejects_signer_overlap(jsonl_dir, tmp_path):
    d = jsonl_dir(LABELS, ["s1", "s2"], per_class=5)
    df, _ = load_samples(sorted(d.glob("*.jsonl")), LABELS)
    cfg = TrainConfig(epochs=1, runs_dir=str(tmp_path / "runs"))
    with pytest.raises(ValueError, match="more than one split"):
        train(cfg, df, {"train": ["s1", "s2"], "val": [], "test": ["s2"]}, LABELS)
