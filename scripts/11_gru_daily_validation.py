#!/usr/bin/env python3
"""
GRU Daily Validation — 2022 Held-out Test
==========================================
Trains the GRU model on daily panel data (sampled every 7th day),
predicts 2022 poverty_rate, and saves per-day actual vs predicted values.

Training  : 2016–2020
Validation: 2021 (early-stopping only)
Test      : 2022 (fully held-out)

Output
------
  data/processed/results/gru_daily_validation_2022.csv
    Columns: date, marz, actual, predicted
"""
from __future__ import annotations

import warnings
import sys
from pathlib import Path

warnings.filterwarnings("ignore")

import numpy as np
import pandas as pd
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import r2_score, mean_squared_error, mean_absolute_error

ROOT        = Path(__file__).resolve().parent.parent
PANEL_DAILY = ROOT / "data/processed/panel/marz_daily_panel_augmented.csv"
RESULTS_DIR = ROOT / "data/processed/results"
OUT_CSV     = RESULTS_DIR / "gru_daily_validation_2022.csv"
RESULTS_DIR.mkdir(parents=True, exist_ok=True)

TARGET    = "poverty_rate"
FEAT_COLS = ["poverty_rate", "crime_rate_per_100k", "hospitals_per_100k",
             "beds_per_10k", "population"]
SEQ_LEN   = 12
SEED      = 42
np.random.seed(SEED)


def load_daily() -> pd.DataFrame:
    df = pd.read_csv(PANEL_DAILY, parse_dates=["date"])
    fill_cols = FEAT_COLS + ["stress_index"]
    for col in fill_cols:
        if col in df.columns:
            df[col] = df.groupby("marz")[col].transform(lambda s: s.ffill().bfill())
    # Sample every 7th row per marz (same as script 07)
    df = (df.groupby("marz", group_keys=False)
            .apply(lambda g: g.sort_values("date").iloc[::7])
            .reset_index(drop=True))
    print(f"Daily (sampled every 7 days): {df.shape[0]} rows, "
          f"{df['marz'].nunique()} regions, "
          f"dates {df['date'].min().date()} – {df['date'].max().date()}")
    return df


def build_gru(inp: int, h: int = 64, layers: int = 2, drop: float = 0.2):
    import torch.nn as nn

    class GRUModel(nn.Module):
        def __init__(self):
            super().__init__()
            self.rnn = nn.GRU(inp, h, layers, batch_first=True,
                              dropout=drop if layers > 1 else 0.0)
            self.fc  = nn.Sequential(nn.Linear(h, 32), nn.ReLU(), nn.Linear(32, 1))

        def forward(self, x):
            out, _ = self.rnn(x)
            return self.fc(out[:, -1]).squeeze(-1)

    return GRUModel()


def make_sequences_with_dates(df: pd.DataFrame, feat_cols: list[str],
                               target: str, scaler: StandardScaler,
                               cond, prev_df: pd.DataFrame | None = None):
    """Return (X, y, dates, marzes) arrays for a given split condition."""
    split_df = df[cond(df["date"])]
    Xs, ys, dates, marzes_out = [], [], [], []
    for region, grp in split_df.groupby("marz"):
        grp = grp.sort_values("date")
        if prev_df is not None:
            ctx = prev_df[prev_df["marz"] == region].sort_values("date").tail(SEQ_LEN)
            grp = pd.concat([ctx, grp])
        arr  = scaler.transform(grp[feat_cols].fillna(0).values)
        dt   = grp["date"].values
        tgt_i = feat_cols.index(target)
        for t in range(SEQ_LEN, len(arr)):
            Xs.append(arr[t - SEQ_LEN: t])
            ys.append(arr[t, tgt_i])
            dates.append(dt[t])
            marzes_out.append(region)
    X = np.array(Xs, dtype=np.float32) if Xs else np.zeros((0, SEQ_LEN, len(feat_cols)), dtype=np.float32)
    y = np.array(ys, dtype=np.float32) if ys else np.zeros(0, dtype=np.float32)
    return X, y, dates, marzes_out


def train_gru(X_tr, y_tr, X_va, y_va, lr=1e-3, max_epochs=120,
              patience=18, batch=32):
    import torch
    import torch.nn as nn
    from torch.utils.data import DataLoader, TensorDataset

    model = build_gru(X_tr.shape[2])
    crit  = nn.MSELoss()
    opt   = torch.optim.Adam(model.parameters(), lr=lr, weight_decay=1e-4)
    sched = torch.optim.lr_scheduler.ReduceLROnPlateau(opt, patience=8, factor=0.5)

    tr_ld = DataLoader(TensorDataset(torch.from_numpy(X_tr), torch.from_numpy(y_tr)),
                       batch_size=batch, shuffle=True)
    va_ld = DataLoader(TensorDataset(torch.from_numpy(X_va), torch.from_numpy(y_va)),
                       batch_size=batch, shuffle=False)

    best_val, best_state, wait = np.inf, None, 0
    for epoch in range(1, max_epochs + 1):
        model.train()
        for xb, yb in tr_ld:
            opt.zero_grad()
            loss = crit(model(xb), yb)
            loss.backward()
            nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            opt.step()

        model.eval()
        with torch.no_grad():
            vl = sum(crit(model(xb), yb).item() * len(xb) for xb, yb in va_ld)
            vl /= max(len(va_ld.dataset), 1)

        sched.step(vl)
        if vl < best_val:
            best_val = vl
            best_state = {k: v.clone() for k, v in model.state_dict().items()}
            wait = 0
        else:
            wait += 1
        if wait >= patience:
            break

    model.load_state_dict(best_state)
    model.eval()
    return model


def main():
    try:
        import torch
    except ImportError:
        print("PyTorch not found. Install with: pip install torch")
        sys.exit(1)

    df = load_daily()

    dy_train = lambda d: d.dt.year <= 2020
    dy_val   = lambda d: d.dt.year == 2021
    dy_test  = lambda d: d.dt.year == 2022   # fully held-out

    train_df = df[dy_train(df["date"])]
    val_df   = df[dy_val(df["date"])]

    scaler  = StandardScaler()
    scaler.fit(train_df[FEAT_COLS].values)
    tgt_idx = FEAT_COLS.index(TARGET)

    print("Building sequences…")
    X_tr, y_tr, _, _  = make_sequences_with_dates(df, FEAT_COLS, TARGET, scaler,
                                                   dy_train)
    X_va, y_va, _, _  = make_sequences_with_dates(df, FEAT_COLS, TARGET, scaler,
                                                   dy_val, train_df)
    X_te, y_te, test_dates, test_marzes = make_sequences_with_dates(
        df, FEAT_COLS, TARGET, scaler, dy_test,
        pd.concat([train_df, val_df])
    )

    print(f"  Train: {len(X_tr)}  Val: {len(X_va)}  Test (2022): {len(X_te)}")

    print("Training GRU…")
    model = train_gru(X_tr, y_tr, X_va, y_va)

    print("Predicting 2022…")
    with torch.no_grad():
        y_pred_scaled = model(torch.from_numpy(X_te)).numpy()

    # Inverse-scale
    mu = scaler.mean_[tgt_idx]
    sd = scaler.scale_[tgt_idx]
    y_actual = y_te * sd + mu
    y_pred   = y_pred_scaled * sd + mu

    r2   = r2_score(y_actual, y_pred)
    rmse = np.sqrt(mean_squared_error(y_actual, y_pred))
    mae  = mean_absolute_error(y_actual, y_pred)
    print(f"\nGRU [poverty] daily 2022 — R²={r2:.4f}  RMSE={rmse:.4f}  MAE={mae:.4f}")

    out = pd.DataFrame({
        "date":      pd.to_datetime(test_dates),
        "marz":      test_marzes,
        "actual":    np.round(y_actual, 4),
        "predicted": np.round(y_pred, 4),
    })
    out = out.sort_values(["marz", "date"]).reset_index(drop=True)
    out["date"] = out["date"].dt.strftime("%Y-%m-%d")
    out.to_csv(OUT_CSV, index=False)
    print(f"\nSaved {len(out)} rows → {OUT_CSV}")
    print(f"Regions: {sorted(out['marz'].unique())}")


if __name__ == "__main__":
    main()
