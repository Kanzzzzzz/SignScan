"""Feature normalization against the shared golden fixtures (the same files the app tests use)."""

from __future__ import annotations

import json

import numpy as np
import pytest

from signscan_ml.config import FIXTURES_DIR, load_labels
from signscan_ml.features import FEATURE_VERSION, normalize_landmarks, true_handedness

FIXTURES = sorted(FIXTURES_DIR.glob("*.json"))


def load(name):
    return json.loads((FIXTURES_DIR / f"{name}.json").read_text())


def compute(fx):
    i = fx["input"]
    return normalize_landmarks(i["landmarks"], i["handedness"], i["image_width"], i["image_height"])


def test_have_enough_fixtures():
    assert len(FIXTURES) >= 4


@pytest.mark.parametrize("path", FIXTURES, ids=lambda p: p.stem)
def test_fixture_matches(path):
    fx = json.loads(path.read_text())
    assert fx["feature_version"] == FEATURE_VERSION
    got = compute(fx)
    assert got.shape == (63,) and got.dtype == np.float32
    np.testing.assert_allclose(got, fx["expected"], atol=1e-5)


def test_left_mirror_equals_right():
    np.testing.assert_allclose(compute(load("left_hand")), compute(load("right_hand")), atol=1e-5)


def test_translation_and_scale_invariant():
    np.testing.assert_allclose(
        compute(load("scaled_translated_hand")), compute(load("right_hand")), atol=1e-5
    )


def test_rotation_is_preserved():
    diff = np.abs(compute(load("rotated_hand")) - compute(load("right_hand"))).max()
    assert diff > 0.1


def test_wrist_origin_and_unit_scale():
    f = compute(load("right_hand")).reshape(21, 3)
    np.testing.assert_allclose(f[0], 0, atol=1e-7)
    assert np.linalg.norm(f[9]) == pytest.approx(1.0, abs=1e-5)


def test_degenerate_fallback_uses_max_norm():
    f = compute(load("degenerate_fallback")).reshape(21, 3)
    assert np.linalg.norm(f, axis=1).max() == pytest.approx(1.0, abs=1e-5)


def test_all_zero_hand():
    assert not normalize_landmarks(np.zeros((21, 3)), "Right", 640, 480).any()


def test_true_handedness():
    assert true_handedness("Left") == "Right"
    assert true_handedness("Right") == "Left"
    assert true_handedness("Left", frame_mirrored=True) == "Left"
    with pytest.raises(ValueError):
        true_handedness("Up")


def test_labels_file_matches_default():
    labels = load_labels()
    assert len(labels) == 24
    assert "J" not in labels and "Z" not in labels
    assert json.loads((FIXTURES_DIR.parent / "labels.json").read_text())["feature_version"] == (
        FEATURE_VERSION
    )
