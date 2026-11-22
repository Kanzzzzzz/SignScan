"""Regenerate shared/fixtures/*.json (golden landmark -> feature vectors for Python and TypeScript).

Run after any change to the feature spec:  python scripts/make_fixtures.py
"""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from signscan_ml.config import FIXTURES_DIR  # noqa: E402
from signscan_ml.features import FEATURE_VERSION, normalize_landmarks  # noqa: E402

W, H = 640, 480


def base_hand_px() -> np.ndarray:
    """A plausible open right hand in PIXEL coordinates (21 x 3), wrist near the bottom."""
    wrist = np.array([320.0, 400.0, 0.0])
    pts = [wrist]
    # (base angle in degrees from +x axis, segment lengths) per finger: thumb, index..pinky
    fingers = [
        (150, [40, 35, 28, 24]),
        (105, [90, 40, 25, 20]),
        (90, [88, 45, 28, 22]),
        (75, [82, 42, 26, 20]),
        (60, [75, 32, 20, 18]),
    ]
    rng = np.random.default_rng(7)
    for f, (ang, segs) in enumerate(fingers):
        p = wrist.copy()
        a = math.radians(ang)
        for k, length in enumerate(segs):
            bend = math.radians(8 * k) * (1 if f == 0 else -0.3)
            p = p + np.array(
                [length * math.cos(a + bend), -length * math.sin(a + bend), -3.0 * (k + 1)]
            )
            pts.append(p.copy())
    arr = np.array(pts)
    arr[:, 2] += rng.normal(0, 1.0, size=21)  # some depth variation
    return arr


def to_norm(px: np.ndarray, w: int = W, h: int = H) -> list[list[float]]:
    out = px.copy()
    out[:, 0] /= w
    out[:, 1] /= h
    out[:, 2] /= w  # MediaPipe z is on roughly the same scale as x
    return [[round(float(v), 7) for v in p] for p in out]


def rotate_px(px: np.ndarray, deg: float) -> np.ndarray:
    a = math.radians(deg)
    c, s = math.cos(a), math.sin(a)
    out = px.copy()
    rel = px[:, :2] - px[0, :2]
    out[:, 0] = px[0, 0] + c * rel[:, 0] - s * rel[:, 1]
    out[:, 1] = px[0, 1] + s * rel[:, 0] + c * rel[:, 1]
    return out


def fixture(name: str, desc: str, landmarks, handedness: str, w: int = W, h: int = H) -> dict:
    expected = normalize_landmarks(landmarks, handedness, w, h)
    return {
        "name": name,
        "description": desc,
        "feature_version": FEATURE_VERSION,
        "input": {
            "landmarks": landmarks,
            "handedness": handedness,
            "image_width": w,
            "image_height": h,
        },
        "expected": [round(float(v), 7) for v in expected],
    }


def main() -> None:
    hand = base_hand_px()
    mirrored = hand.copy()
    mirrored[:, 0] = W - mirrored[:, 0]
    scaled = hand.copy()
    scaled[:, :2] = (hand[:, :2] - hand[0, :2]) * 0.6 + np.array([150.0, 300.0])
    scaled[:, 2] = hand[:, 2] * 0.6
    portrait = hand.copy()
    portrait[:, 0] -= 100  # keep inside a 480-wide frame
    degenerate = np.tile(hand[0], (21, 1))
    degenerate[1:5] += np.array([30.0, -10.0, 0.0])  # wrist == middle MCP, thumb elsewhere

    fixtures = [
        fixture("right_hand", "Open right hand, 640x480 frame.", to_norm(hand), "Right"),
        fixture(
            "left_hand",
            "Exact horizontal mirror of right_hand, labelled Left. Must equal right_hand.",
            to_norm(mirrored),
            "Left",
        ),
        fixture(
            "rotated_hand",
            "right_hand rotated 30 degrees about the wrist. Must differ from right_hand.",
            to_norm(rotate_px(hand, 30)),
            "Right",
        ),
        fixture(
            "scaled_translated_hand",
            "right_hand at 60% size, moved elsewhere in the frame. Must equal right_hand.",
            to_norm(scaled),
            "Right",
        ),
        fixture(
            "portrait_frame",
            "right_hand shape in a 480x640 portrait frame (aspect correction).",
            to_norm(portrait, 480, 640),
            "Right",
            480,
            640,
        ),
        fixture(
            "degenerate_fallback",
            "Wrist coincides with middle MCP; scale falls back to the max point norm.",
            to_norm(degenerate),
            "Right",
        ),
    ]
    FIXTURES_DIR.mkdir(parents=True, exist_ok=True)
    for fx in fixtures:
        path = FIXTURES_DIR / f"{fx['name']}.json"
        path.write_text(json.dumps(fx, indent=1) + "\n", encoding="utf-8")
        print("wrote", path)


if __name__ == "__main__":
    main()
