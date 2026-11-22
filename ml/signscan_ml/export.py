"""ONNX export with a PyTorch-vs-onnxruntime parity check. The app only gets a model that passes."""

from __future__ import annotations

import inspect
import json
import shutil
from datetime import UTC, datetime
from pathlib import Path

import numpy as np
import torch
from torch import nn

from signscan_ml.features import FEATURE_VERSION

INPUT_NAME = "features"
OUTPUT_NAME = "probs"
PARITY_TOL = 1e-4


class _WithSoftmax(nn.Module):
    def __init__(self, model: nn.Module) -> None:
        super().__init__()
        self.model = model

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return torch.softmax(self.model(x), dim=1)


def export_onnx(model: nn.Module, path: Path, opset: int = 17) -> Path:
    model.eval()
    wrapped = _WithSoftmax(model).eval()
    dummy = torch.zeros(2, 63, dtype=torch.float32)
    kwargs = dict(
        input_names=[INPUT_NAME],
        output_names=[OUTPUT_NAME],
        dynamic_axes={INPUT_NAME: {0: "batch"}, OUTPUT_NAME: {0: "batch"}},
        opset_version=opset,
    )
    if "dynamo" in inspect.signature(torch.onnx.export).parameters:
        kwargs["dynamo"] = False  # the TorchScript exporter needs no extra deps
    path.parent.mkdir(parents=True, exist_ok=True)
    torch.onnx.export(wrapped, (dummy,), str(path), **kwargs)
    return path


def parity_check(model: nn.Module, onnx_path: Path, x: np.ndarray) -> dict:
    import onnxruntime as ort

    model.eval()
    with torch.no_grad():
        ref = torch.softmax(model(torch.tensor(x, dtype=torch.float32)), dim=1).numpy()
    sess = ort.InferenceSession(str(onnx_path), providers=["CPUExecutionProvider"])
    got = sess.run([OUTPUT_NAME], {INPUT_NAME: x.astype(np.float32)})[0]
    max_diff = float(np.max(np.abs(ref - got))) if len(x) else 0.0
    same_argmax = float(np.mean(ref.argmax(1) == got.argmax(1))) if len(x) else 1.0
    return {
        "n": int(len(x)),
        "max_abs_diff": max_diff,
        "argmax_agreement": same_argmax,
        "passed": bool(max_diff <= PARITY_TOL and same_argmax == 1.0),
        "tolerance": PARITY_TOL,
    }


def export_run(
    model: nn.Module,
    labels: list[str],
    parity_x: np.ndarray,
    out_dir: Path,
    metrics: dict | None = None,
    run_id: str = "",
) -> dict:
    """Export to a temp file, run parity, then write signscan.onnx + metadata to out_dir."""
    out_dir.mkdir(parents=True, exist_ok=True)
    tmp = out_dir / "signscan.onnx.tmp"
    export_onnx(model, tmp)
    parity = parity_check(model, tmp, parity_x)
    if not parity["passed"]:
        tmp.unlink(missing_ok=True)
        raise RuntimeError(f"ONNX parity check failed: {parity}")
    shutil.move(str(tmp), out_dir / "signscan.onnx")
    meta = {
        "feature_version": FEATURE_VERSION,
        "input": INPUT_NAME,
        "output": OUTPUT_NAME,
        "num_classes": len(labels),
        "exported_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "run_id": run_id,
        "parity": parity,
        "metrics": metrics or {},
    }
    (out_dir / "labels.json").write_text(json.dumps(labels), encoding="utf-8")
    (out_dir / "model_meta.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
    return meta
