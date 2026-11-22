"""Classifiers over the 63-d landmark feature. Both take (B, 63) and return logits (B, N)."""

from __future__ import annotations

import torch
from torch import nn


class LandmarkCNN(nn.Module):
    """1D-CNN treating the hand as a sequence of 21 points with 3 channels (x, y, z)."""

    def __init__(self, num_classes: int, dropout: float = 0.3) -> None:
        super().__init__()
        self.features = nn.Sequential(
            nn.Conv1d(3, 64, kernel_size=3, padding=1),
            nn.BatchNorm1d(64),
            nn.ReLU(inplace=True),
            nn.Conv1d(64, 128, kernel_size=3, padding=1),
            nn.BatchNorm1d(128),
            nn.ReLU(inplace=True),
            nn.Conv1d(128, 128, kernel_size=3, padding=1),
            nn.BatchNorm1d(128),
            nn.ReLU(inplace=True),
        )
        self.head = nn.Sequential(nn.Dropout(dropout), nn.Linear(128, num_classes))

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        x = x.reshape(x.shape[0], 21, 3).transpose(1, 2)  # (B, 3, 21)
        x = self.features(x)
        x = x.mean(dim=2)  # global average pool over landmarks
        return self.head(x)


class LandmarkMLP(nn.Module):
    """Baseline: 63 -> 256 -> 128 -> N."""

    def __init__(self, num_classes: int, dropout: float = 0.3) -> None:
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(63, 256),
            nn.ReLU(inplace=True),
            nn.Dropout(dropout),
            nn.Linear(256, 128),
            nn.ReLU(inplace=True),
            nn.Dropout(dropout),
            nn.Linear(128, num_classes),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.net(x.reshape(x.shape[0], 63))


MODELS = {"cnn": LandmarkCNN, "mlp": LandmarkMLP}


def build_model(name: str, num_classes: int, dropout: float = 0.3) -> nn.Module:
    try:
        cls = MODELS[name]
    except KeyError as e:
        raise ValueError(f"Unknown model {name!r}; choose from {sorted(MODELS)}") from e
    return cls(num_classes=num_classes, dropout=dropout)


def count_parameters(model: nn.Module) -> int:
    return sum(p.numel() for p in model.parameters() if p.requires_grad)
