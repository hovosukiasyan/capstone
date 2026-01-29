"""
Poverty forecasting with a small PyTorch MLP + activation sweep.

Uses the same philosophy as the notebook:
- Panel data by marz/year
- Time-based split: train <= 2020, test >= 2021
- Standardize features using train-only statistics
- Compare to a strong baseline: poverty_lag1

Outputs:
- data/processed/results/poverty_nn_activation_sweep.csv
"""

from __future__ import annotations

import math
import os
import random
from dataclasses import dataclass
from typing import Callable, Dict, List, Tuple

import numpy as np
import pandas as pd
import torch
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from torch import nn


SEED = 42
DATA_PATH = "data/processed/panel/marz_year_panel_full.csv"
OUT_PATH = "data/processed/results/poverty_nn_activation_sweep.csv"


PREDICTOR_COLS = [
    # lag
    "poverty_lag1",
    # Crime
    "crime_rate_per_100k",
    "crime_selected_rate_per_100k",
    "crime_total",
    # Health capacity
    "hospitals_per_100k",
    "beds_per_10k",
    "hospitals",
    "beds",
    "Number of physicians",
    "Number of hospitalized patients",
    "Annual average occupancy of a bed",
    # Context/time
    "population",
    "year",
]

TARGET_COL = "poverty_rate"


def set_seed(seed: int) -> None:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)


def make_activation(name: str) -> nn.Module:
    name = name.lower()
    if name == "relu":
        return nn.ReLU()
    if name == "tanh":
        return nn.Tanh()
    if name == "leaky_relu":
        return nn.LeakyReLU(negative_slope=0.01)
    if name == "elu":
        return nn.ELU()
    if name == "sigmoid":
        return nn.Sigmoid()
    # “mahout” isn’t a standard activation; include modern smooth alternatives
    if name == "mish":
        return nn.Mish()
    if name == "gelu":
        return nn.GELU()
    raise ValueError(f"Unknown activation: {name}")


class MLPRegressor(nn.Module):
    def __init__(
        self,
        in_dim: int,
        hidden_dims: Tuple[int, ...],
        activation: nn.Module,
        dropout: float = 0.0,
    ) -> None:
        super().__init__()
        layers: List[nn.Module] = []
        prev = in_dim
        for h in hidden_dims:
            layers.append(nn.Linear(prev, h))
            layers.append(activation)
            if dropout and dropout > 0:
                layers.append(nn.Dropout(dropout))
            prev = h
        layers.append(nn.Linear(prev, 1))
        self.net = nn.Sequential(*layers)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.net(x).squeeze(-1)


@dataclass(frozen=True)
class TrainConfig:
    lr: float = 1e-3
    weight_decay: float = 1e-4
    batch_size: int = 32
    max_epochs: int = 2000
    patience: int = 100
    min_delta: float = 1e-5


def standardize_train_only(
    X_train: np.ndarray, X_val: np.ndarray, X_test: np.ndarray
) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    mean = X_train.mean(axis=0, keepdims=True)
    std = X_train.std(axis=0, keepdims=True)
    std = np.where(std == 0, 1.0, std)
    return (X_train - mean) / std, (X_val - mean) / std, (X_test - mean) / std


def to_tensor(x: np.ndarray, device: torch.device) -> torch.Tensor:
    return torch.tensor(x, dtype=torch.float32, device=device)


def iter_minibatches(
    X: torch.Tensor, y: torch.Tensor, batch_size: int, rng: np.random.Generator
):
    n = X.shape[0]
    idx = np.arange(n)
    rng.shuffle(idx)
    for start in range(0, n, batch_size):
        sl = idx[start : start + batch_size]
        yield X[sl], y[sl]


@torch.no_grad()
def eval_loss(model: nn.Module, X: torch.Tensor, y: torch.Tensor) -> float:
    model.eval()
    pred = model(X)
    loss = nn.functional.mse_loss(pred, y)
    return float(loss.detach().cpu().item())


def train_mlp(
    model: nn.Module,
    X_train: torch.Tensor,
    y_train: torch.Tensor,
    X_val: torch.Tensor,
    y_val: torch.Tensor,
    cfg: TrainConfig,
    seed: int,
) -> nn.Module:
    rng = np.random.default_rng(seed)
    optim = torch.optim.AdamW(model.parameters(), lr=cfg.lr, weight_decay=cfg.weight_decay)

    best_state = None
    best_val = math.inf
    no_improve = 0

    for epoch in range(cfg.max_epochs):
        model.train()
        for xb, yb in iter_minibatches(X_train, y_train, cfg.batch_size, rng):
            optim.zero_grad(set_to_none=True)
            pred = model(xb)
            loss = nn.functional.mse_loss(pred, yb)
            loss.backward()
            optim.step()

        val_loss = eval_loss(model, X_val, y_val)
        if val_loss < best_val - cfg.min_delta:
            best_val = val_loss
            best_state = {k: v.detach().cpu().clone() for k, v in model.state_dict().items()}
            no_improve = 0
        else:
            no_improve += 1

        if no_improve >= cfg.patience:
            break

    if best_state is not None:
        model.load_state_dict(best_state)
    return model


@torch.no_grad()
def predict(model: nn.Module, X: torch.Tensor) -> np.ndarray:
    model.eval()
    pred = model(X).detach().cpu().numpy()
    return pred


def compute_metrics(y_true: np.ndarray, y_pred: np.ndarray) -> Dict[str, float]:
    return {
        "r2": float(r2_score(y_true, y_pred)),
        "mse": float(mean_squared_error(y_true, y_pred)),
        "mae": float(mean_absolute_error(y_true, y_pred)),
    }


def main() -> None:
    set_seed(SEED)

    # Load + build lag
    df = pd.read_csv(DATA_PATH)
    df = df.sort_values(["marz", "year"]).copy()
    df["poverty_lag1"] = df.groupby("marz")[TARGET_COL].shift(1)

    # Keep only usable rows
    needed = ["marz", "year", TARGET_COL] + PREDICTOR_COLS
    df = df.dropna(subset=needed).copy()

    # Time split
    train_mask = df["year"] <= 2020
    test_mask = df["year"] >= 2021
    if not train_mask.any() or not test_mask.any():
        raise RuntimeError(
            f"Time split produced empty train/test. year range={df['year'].min()}..{df['year'].max()}"
        )

    # Validation split: use the last train year as validation (preserve time ordering)
    val_year = int(df.loc[train_mask, "year"].max())
    train2_mask = df["year"] < val_year
    val_mask = df["year"] == val_year

    X_train = df.loc[train2_mask, PREDICTOR_COLS].to_numpy(dtype=np.float64)
    y_train = df.loc[train2_mask, TARGET_COL].to_numpy(dtype=np.float64)

    X_val = df.loc[val_mask, PREDICTOR_COLS].to_numpy(dtype=np.float64)
    y_val = df.loc[val_mask, TARGET_COL].to_numpy(dtype=np.float64)

    X_test = df.loc[test_mask, PREDICTOR_COLS].to_numpy(dtype=np.float64)
    y_test = df.loc[test_mask, TARGET_COL].to_numpy(dtype=np.float64)

    # Standardize using train-only stats
    X_train_s, X_val_s, X_test_s = standardize_train_only(X_train, X_val, X_test)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    X_train_t = to_tensor(X_train_s, device)
    y_train_t = to_tensor(y_train, device)
    X_val_t = to_tensor(X_val_s, device)
    y_val_t = to_tensor(y_val, device)
    X_test_t = to_tensor(X_test_s, device)

    # Baseline (lag-1 only)
    baseline_pred = df.loc[test_mask, "poverty_lag1"].to_numpy(dtype=np.float64)
    baseline_metrics = compute_metrics(y_test, baseline_pred)

    rows = [
        {
            "model": "baseline",
            "activation": "na",
            "hidden_dims": "na",
            "val_year": val_year,
            **baseline_metrics,
        }
    ]

    cfg = TrainConfig()
    activations = ["relu", "tanh", "leaky_relu", "elu", "sigmoid", "mish", "gelu"]
    hidden_grid: List[Tuple[int, ...]] = [
        (16,),
        (32,),
        (64,),
        (32, 16),
        (64, 32),
    ]

    in_dim = X_train_t.shape[1]
    for act_name in activations:
        act = make_activation(act_name)
        for hidden_dims in hidden_grid:
            model = MLPRegressor(in_dim=in_dim, hidden_dims=hidden_dims, activation=act).to(device)
            model = train_mlp(
                model=model,
                X_train=X_train_t,
                y_train=y_train_t,
                X_val=X_val_t,
                y_val=y_val_t,
                cfg=cfg,
                seed=SEED,
            )
            test_pred = predict(model, X_test_t)
            m = compute_metrics(y_test, test_pred)
            rows.append(
                {
                    "model": "mlp",
                    "activation": act_name,
                    "hidden_dims": "x".join(map(str, hidden_dims)),
                    "val_year": val_year,
                    **m,
                }
            )

    out_df = pd.DataFrame(rows).sort_values(["r2", "mse"], ascending=[False, True]).reset_index(
        drop=True
    )

    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    out_df.to_csv(OUT_PATH, index=False)

    # Print best models for quick feedback
    print("Saved:", OUT_PATH)
    print(out_df.head(10).to_string(index=False))


if __name__ == "__main__":
    main()

