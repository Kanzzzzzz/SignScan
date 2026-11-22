"""Training-time augmentation on normalized 63-d features (wrist already at the origin).

Rotation is kept small (default ±15°) because some letters differ mainly by orientation.
"""

from __future__ import annotations

from typing import Any

import numpy as np


def augment_batch(x: np.ndarray, rng: np.random.Generator, params: dict[str, Any]) -> np.ndarray:
    """Return an augmented copy of a (N, 63) batch."""
    n = x.shape[0]
    if n == 0:
        return x.copy()
    pts = x.reshape(n, 21, 3).astype(np.float32).copy()

    rotate_deg = float(params.get("rotate_deg", 0.0))
    if rotate_deg > 0:
        theta = np.deg2rad(rng.uniform(-rotate_deg, rotate_deg, size=n)).astype(np.float32)
        c, s = np.cos(theta), np.sin(theta)
        px, py = pts[:, :, 0].copy(), pts[:, :, 1].copy()
        pts[:, :, 0] = c[:, None] * px - s[:, None] * py
        pts[:, :, 1] = s[:, None] * px + c[:, None] * py

    scale = float(params.get("scale", 0.0))
    if scale > 0:
        pts *= rng.uniform(1 - scale, 1 + scale, size=(n, 1, 1)).astype(np.float32)

    jitter = float(params.get("jitter_std", 0.0))
    if jitter > 0:
        noise = rng.normal(0, jitter, size=pts.shape).astype(np.float32)
        noise[:, 0, :] = 0  # the wrist stays at the origin
        pts += noise

    # Mirroring keeps the label. It only matters when handedness is misdetected, so p is low.
    mirror_p = float(params.get("mirror_p", 0.0))
    if mirror_p > 0:
        flip = rng.random(n) < mirror_p
        pts[flip, :, 0] *= -1

    drop_p = float(params.get("landmark_dropout_p", 0.0))
    if drop_p > 0:
        mask = rng.random((n, 21)) < drop_p
        mask[:, 0] = False
        pts[mask] = 0.0

    return pts.reshape(n, 63)
