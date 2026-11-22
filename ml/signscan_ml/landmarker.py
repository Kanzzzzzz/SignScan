"""Thin wrapper over the MediaPipe Tasks HandLandmarker (Python side: extraction and live demo)."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import numpy as np

from signscan_ml.config import HAND_LANDMARKER_PATH
from signscan_ml.features import true_handedness

MODEL_URL = (
    "https://storage.googleapis.com/mediapipe-models/hand_landmarker/"
    "hand_landmarker/float16/1/hand_landmarker.task"
)

# MediaPipe hand topology (pairs of landmark indices)
HAND_CONNECTIONS = [
    (0, 1), (1, 2), (2, 3), (3, 4),
    (0, 5), (5, 6), (6, 7), (7, 8),
    (5, 9), (9, 10), (10, 11), (11, 12),
    (9, 13), (13, 14), (14, 15), (15, 16),
    (13, 17), (0, 17), (17, 18), (18, 19), (19, 20),
]  # fmt: skip


@dataclass
class HandResult:
    landmarks: np.ndarray  # (21, 3) normalized image coords
    handedness: str  # signer's actual hand
    score: float


def ensure_model(path: Path = HAND_LANDMARKER_PATH) -> Path:
    if path.exists():
        return path
    raise FileNotFoundError(
        f"{path} not found. Run `npm run setup` in app/ (downloads it), or fetch {MODEL_URL}"
    )


class HandTracker:
    def __init__(
        self,
        mode: str = "image",
        model_path: Path = HAND_LANDMARKER_PATH,
        min_detection_confidence: float = 0.5,
    ) -> None:
        import mediapipe as mp
        from mediapipe.tasks.python import BaseOptions, vision

        self._mp = mp
        running = {"image": vision.RunningMode.IMAGE, "video": vision.RunningMode.VIDEO}[mode]
        opts = vision.HandLandmarkerOptions(
            base_options=BaseOptions(model_asset_path=str(ensure_model(model_path))),
            running_mode=running,
            num_hands=1,
            min_hand_detection_confidence=min_detection_confidence,
        )
        self._lm = vision.HandLandmarker.create_from_options(opts)
        self._mode = mode

    def detect(self, rgb: np.ndarray, timestamp_ms: int | None = None) -> HandResult | None:
        """`rgb` is an unmirrored HxWx3 uint8 RGB frame."""
        image = self._mp.Image(
            image_format=self._mp.ImageFormat.SRGB, data=np.ascontiguousarray(rgb)
        )
        if self._mode == "video":
            res = self._lm.detect_for_video(image, int(timestamp_ms or 0))
        else:
            res = self._lm.detect(image)
        if not res.hand_landmarks:
            return None
        pts = np.array([[p.x, p.y, p.z] for p in res.hand_landmarks[0]], dtype=np.float32)
        cat = res.handedness[0][0]
        return HandResult(pts, true_handedness(cat.category_name), float(cat.score))

    def close(self) -> None:
        self._lm.close()

    def __enter__(self) -> HandTracker:
        return self

    def __exit__(self, *exc) -> None:
        self.close()
