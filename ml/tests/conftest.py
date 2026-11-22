from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def synthetic_samples(labels, signers, per_class=30, seed=0):
    """Fake but learnable JSONL samples: one random prototype hand per class plus noise."""
    rng = np.random.default_rng(seed)
    protos = {lab: rng.uniform(0.3, 0.7, size=(21, 3)) * [1, 1, 0.1] for lab in labels}
    out = []
    for signer in signers:
        offset = rng.uniform(-0.1, 0.1, size=2)
        for lab in labels:
            for i in range(per_class):
                pts = protos[lab] + rng.normal(0, 0.004, size=(21, 3))
                pts[:, :2] += offset
                out.append(
                    {
                        "label": lab,
                        "signer_id": signer,
                        "session": "s1",
                        "burst_id": f"{signer}-{lab}-{i // 10}",
                        "conditions": {
                            "lighting": ["bright", "dim"][i % 2],
                            "background": "plain",
                            "distance": "near",
                        },
                        "landmarks": pts.tolist(),
                        "handedness": "Right",
                        "handedness_score": 0.95,
                        "image_width": 640,
                        "image_height": 480,
                        "ts": i,
                        "feature_version": 1,
                    }
                )
    return out


@pytest.fixture
def jsonl_dir(tmp_path):
    def make(labels, signers, per_class=30):
        path = tmp_path / "raw" / "samples.jsonl"
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "w") as fh:
            for s in synthetic_samples(labels, signers, per_class):
                fh.write(json.dumps(s) + "\n")
        return path.parent

    return make
