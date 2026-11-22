"""Landmark normalization. Mirrors app/src/lib/features.ts exactly; see shared/feature_spec.md.

Change both files together, bump FEATURE_VERSION and regenerate shared/fixtures.
"""

from __future__ import annotations

from collections.abc import Sequence

import numpy as np

FEATURE_VERSION = 1
_EPS = 1e-6


def true_handedness(mediapipe_label: str, frame_mirrored: bool = False) -> str:
    """Convert MediaPipe's handedness label to the signer's actual hand.

    MediaPipe labels handedness as if the image were a mirrored selfie. SignScan feeds
    raw (unmirrored) frames, so the label has to be swapped.
    """
    label = mediapipe_label.strip().capitalize()
    if label not in ("Left", "Right"):
        raise ValueError(f"Unknown handedness label: {mediapipe_label!r}")
    if frame_mirrored:
        return label
    return "Right" if label == "Left" else "Left"


def normalize_landmarks(
    landmarks: Sequence[Sequence[float]] | np.ndarray,
    handedness: str,
    image_width: float,
    image_height: float,
) -> np.ndarray:
    """21 raw MediaPipe landmarks -> 63-d float32 feature vector (FEATURE_VERSION 1)."""
    pts = np.asarray(landmarks, dtype=np.float64).reshape(21, 3).copy()
    if image_height <= 0 or image_width <= 0:
        raise ValueError("image_width and image_height must be positive")

    # 1. Aspect ratio
    pts[:, 0] *= image_width / image_height
    # 2. Mirror left hands into right-hand space
    if handedness == "Left":
        pts[:, 0] = -pts[:, 0]
    elif handedness != "Right":
        raise ValueError(f"handedness must be 'Left' or 'Right', got {handedness!r}")
    # 3. Translate: wrist to origin
    pts -= pts[0]
    # 4. Scale by wrist -> middle MCP distance, with fallbacks
    scale = float(np.linalg.norm(pts[9]))
    if scale < _EPS:
        scale = float(np.max(np.linalg.norm(pts, axis=1)))
    if scale < _EPS:
        return np.zeros(63, dtype=np.float32)
    pts /= scale
    # 5. No rotation normalization. 6. Flatten in landmark order.
    return pts.reshape(63).astype(np.float32)


def normalize_batch(
    landmarks: np.ndarray,
    handedness: Sequence[str],
    image_width: Sequence[float],
    image_height: Sequence[float],
) -> np.ndarray:
    """Vectorised convenience wrapper: (N, 21, 3) -> (N, 63)."""
    return (
        np.stack(
            [
                normalize_landmarks(lm, h, w, hh)
                for lm, h, w, hh in zip(
                    landmarks, handedness, image_width, image_height, strict=True
                )
            ]
        )
        if len(landmarks)
        else np.zeros((0, 63), dtype=np.float32)
    )
