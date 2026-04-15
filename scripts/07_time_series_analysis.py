#!/usr/bin/env python3
"""
Time Series Analysis: Classical (ARIMA, lag features, ACF/PACF) +
Neural Networks (GRU, BiLSTM, Transformer, TCN) on yearly, monthly,
and daily Armenia poverty/stress panel data.

Outputs:
  data/processed/results/ts_classical_results.csv
  data/processed/results/ts_nn_results.csv
  data/processed/results/ts_acf_pacf/  (ACF/PACF PNG plots)

Usage:
  python3.11 scripts/07_time_series_analysis.py          # analysis only
  python3.11 scripts/07_time_series_analysis.py --push   # + insert into DB
"""
from __future__ import annotations

import sys
import warnings
import argparse
import os
from pathlib import Path

warnings.filterwarnings("ignore")

import numpy as np
import pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import Ridge
from sklearn.metrics import r2_score, mean_squared_error, mean_absolute_error
from statsmodels.tsa.stattools import acf, pacf
from statsmodels.tsa.arima.model import ARIMA
import itertools

# ── Paths ─────────────────────────────────────────────────────────────────────
ROOT          = Path(__file__).resolve().parent.parent
PANEL_YEARLY  = ROOT / "data/processed/panel/marz_year_panel_common_with_stress.csv"
PANEL_MONTHLY = ROOT / "data/processed/panel/marz_monthly_panel_augmented.csv"
PANEL_DAILY   = ROOT / "data/processed/panel/marz_daily_panel_augmented.csv"
RESULTS_DIR   = ROOT / "data/processed/results"
ACF_DIR       = RESULTS_DIR / "ts_acf_pacf"
RESULTS_DIR.mkdir(parents=True, exist_ok=True)
ACF_DIR.mkdir(parents=True, exist_ok=True)

TARGET_POVERTY = "poverty_rate"
TARGET_STRESS  = "stress_index"
SEED = 42
np.random.seed(SEED)


# ═══════════════════════════════════════════════════════════════════════════════
# UTILITIES
# ═══════════════════════════════════════════════════════════════════════════════

def metrics(y_true: np.ndarray, y_pred: np.ndarray) -> dict:
    r2  = r2_score(y_true, y_pred)
    mae = mean_absolute_error(y_true, y_pred)
    rmse = np.sqrt(mean_squared_error(y_true, y_pred))
    return {"R2": round(float(r2), 6), "MAE": round(float(mae), 6), "RMSE": round(float(rmse), 6)}


def lag_series(series: pd.Series, lags: list[int]) -> pd.DataFrame:
    return pd.DataFrame({f"lag{l}": series.shift(l) for l in lags}, index=series.index)


def header(title: str) -> None:
    print(f"\n{'═'*65}\n  {title}\n{'═'*65}")


# ═══════════════════════════════════════════════════════════════════════════════
# DATA LOADING
# ═══════════════════════════════════════════════════════════════════════════════

def load_data():
    df_y = pd.read_csv(PANEL_YEARLY)
    df_m = pd.read_csv(PANEL_MONTHLY, parse_dates=["date"])
    df_d = pd.read_csv(PANEL_DAILY,   parse_dates=["date"])

    # Derive stress_index in monthly/daily if missing (z_poverty + z_crime - z_health)
    for df in [df_m, df_d]:
        if "stress_index" not in df.columns or df["stress_index"].isna().all():
            from scipy.stats import zscore
            df["stress_index"] = zscore(
                zscore(df["poverty_rate"].fillna(df["poverty_rate"].mean())) +
                zscore(df["crime_rate_per_100k"].fillna(df["crime_rate_per_100k"].mean())) -
                zscore(df["hospitals_per_100k"].fillna(df["hospitals_per_100k"].mean()))
            )

    FILL_COLS = ["poverty_rate", "crime_rate_per_100k", "hospitals_per_100k",
                 "beds_per_10k", "population", "stress_index"]
    for df in [df_m, df_d]:
        for col in FILL_COLS:
            if col in df.columns:
                df[col] = df.groupby("marz")[col].transform(lambda s: s.ffill().bfill())

    print(f"Yearly:  {df_y.shape}")
    print(f"Monthly: {df_m.shape}")
    print(f"Daily:   {df_d.shape}")
    return df_y, df_m, df_d


# ═══════════════════════════════════════════════════════════════════════════════
# ACF / PACF PLOTS
# ═══════════════════════════════════════════════════════════════════════════════

def plot_acf_pacf(series: pd.Series, title: str, fname: str, nlags: int = 12):
    s = series.dropna()
    max_lags = max(1, len(s) // 2 - 1)
    nlags = min(nlags, max_lags)
    if nlags < 2:
        return

    acf_r,  acf_ci  = acf(s, nlags=nlags, alpha=0.05)
    pacf_r, pacf_ci = pacf(s, nlags=nlags, alpha=0.05, method="ywm")

    fig, axes = plt.subplots(1, 2, figsize=(12, 4))
    fig.suptitle(title, fontsize=11)
    lags = np.arange(nlags + 1)

    for ax, vals, ci, color, ttl in [
        (axes[0], acf_r,  acf_ci,  "steelblue", "ACF"),
        (axes[1], pacf_r, pacf_ci, "coral",     "PACF"),
    ]:
        ax.bar(lags, vals, color=color, alpha=0.75, width=0.4)
        if ci.ndim == 2:
            lo = ci[:, 0] - vals
            hi = ci[:, 1] - vals
            ax.fill_between(lags, lo, hi, alpha=0.18, color=color)
        ax.axhline(0, color="black", lw=0.8)
        ax.set_title(ttl); ax.set_xlabel("Lag"); ax.grid(alpha=0.3)

    plt.tight_layout()
    plt.savefig(ACF_DIR / fname, dpi=120, bbox_inches="tight")
    plt.close()


def run_acf_pacf(df_y: pd.DataFrame, df_m: pd.DataFrame):
    header("ACF / PACF Analysis")
    agg = df_y.groupby("year")
    plot_acf_pacf(agg[TARGET_POVERTY].mean(), "Poverty Rate — Yearly avg", "poverty_yearly_acf.png", 5)
    plot_acf_pacf(agg[TARGET_STRESS].mean(),  "Stress Index — Yearly avg",  "stress_yearly_acf.png",  5)

    for region in ["Yerevan", "Shirak"]:
        sub = df_m[df_m["marz"] == region].sort_values("date")
        plot_acf_pacf(sub[TARGET_POVERTY], f"Poverty — Monthly ({region})",
                      f"poverty_monthly_{region.lower()}_acf.png", 24)
        if "stress_index" in sub.columns:
            plot_acf_pacf(sub[TARGET_STRESS], f"Stress — Monthly ({region})",
                          f"stress_monthly_{region.lower()}_acf.png", 24)

    print(f"  Plots saved → {ACF_DIR}")


# ═══════════════════════════════════════════════════════════════════════════════
# CLASSICAL: LAG-1 BASELINE
# ═══════════════════════════════════════════════════════════════════════════════

def lag1_baseline(df: pd.DataFrame, target: str, freq: str,
                  time_col: str, test_cond) -> dict | None:
    all_true, all_pred = [], []
    for _, grp in df.groupby("marz"):
        grp = grp.sort_values(time_col).reset_index(drop=True)
        grp["_lag1"] = grp[target].shift(1)
        test = grp[test_cond(grp[time_col])].dropna(subset=["_lag1"])
        if len(test) < 1:
            continue
        all_true.extend(test[target].tolist())
        all_pred.extend(test["_lag1"].tolist())
    if not all_true:
        return None
    m = metrics(np.array(all_true), np.array(all_pred))
    print(f"  [{freq:<8}] Lag-1 Baseline:          R²={m['R2']:+.4f}  MAE={m['MAE']:.4f}")
    return {"source": "time_series_classical", "model": "Lag-1 Baseline",
            "target": target, "frequency": freq, **m}


# ═══════════════════════════════════════════════════════════════════════════════
# CLASSICAL: RIDGE WITH LAG FEATURES
# ═══════════════════════════════════════════════════════════════════════════════

def ridge_lags(df: pd.DataFrame, target: str, freq: str, time_col: str,
               lags: list[int], train_cond, test_cond) -> dict | None:
    all_true, all_pred = [], []
    for _, grp in df.groupby("marz"):
        grp = grp.sort_values(time_col).reset_index(drop=True)
        lag_df = lag_series(grp[target], lags)
        combined = pd.concat([grp[[time_col, target]], lag_df], axis=1).dropna()
        train = combined[train_cond(combined[time_col])]
        test  = combined[test_cond(combined[time_col])]
        if len(train) < len(lags) + 2 or len(test) < 1:
            continue
        feat = [c for c in combined.columns if c.startswith("lag")]
        m = Ridge(alpha=1.0).fit(train[feat], train[target])
        all_true.extend(test[target].tolist())
        all_pred.extend(m.predict(test[feat]).tolist())
    if not all_true:
        return None
    m = metrics(np.array(all_true), np.array(all_pred))
    lag_label = "+".join(f"L{l}" for l in lags)
    print(f"  [{freq:<8}] Ridge({lag_label}):     R²={m['R2']:+.4f}  MAE={m['MAE']:.4f}")
    return {"source": "time_series_classical", "model": f"Ridge (lags {lags})",
            "target": target, "frequency": freq, **m}


# ═══════════════════════════════════════════════════════════════════════════════
# CLASSICAL: ARIMA (auto AIC/BIC selection, region by region)
# ═══════════════════════════════════════════════════════════════════════════════

def _best_arima(series: np.ndarray, max_p=2, max_q=2) -> tuple[int, int, int]:
    """Select ARIMA(p,d,q) by AIC over a small grid. d fixed to 1 for short series."""
    best_aic, best_order = np.inf, (1, 1, 0)
    for p, q in itertools.product(range(max_p + 1), range(max_q + 1)):
        if p + q == 0:
            continue
        for d in [0, 1]:
            try:
                res = ARIMA(series, order=(p, d, q)).fit()
                if res.aic < best_aic:
                    best_aic = res.aic
                    best_order = (p, d, q)
            except Exception:
                pass
    return best_order


def arima_panel(df: pd.DataFrame, target: str, freq: str,
                time_col: str, train_cond, test_cond,
                max_p=2, max_q=2) -> dict | None:
    all_true, all_pred, orders = [], [], []

    for region, grp in df.groupby("marz"):
        grp = grp.sort_values(time_col).reset_index(drop=True)
        tr = grp[train_cond(grp[time_col])][target].dropna()
        te = grp[test_cond(grp[time_col])][target].dropna()
        if len(tr) < 8 or len(te) < 1:
            continue

        order = _best_arima(tr.values, max_p, max_q)
        orders.append(order)

        # Rolling one-step-ahead on test
        history = list(tr.values)
        preds = []
        for obs in te.values:
            try:
                fc = ARIMA(history, order=order).fit().forecast(1)
                preds.append(float(fc.iloc[0]))
            except Exception:
                preds.append(history[-1])   # fallback: last known
            history.append(float(obs))

        all_true.extend(te.values.tolist())
        all_pred.extend(preds)

    if not all_true:
        return None

    m = metrics(np.array(all_true), np.array(all_pred))
    mode_order = max(set(orders), key=orders.count) if orders else "(?,?,?)"
    label = f"ARIMA{mode_order}"
    print(f"  [{freq:<8}] {label} (mode order): R²={m['R2']:+.4f}  MAE={m['MAE']:.4f}")
    return {"source": "time_series_classical", "model": label,
            "target": target, "frequency": freq, **m}


# ═══════════════════════════════════════════════════════════════════════════════
# NEURAL NETWORKS
# ═══════════════════════════════════════════════════════════════════════════════

def _make_sequences(df: pd.DataFrame, feat_cols: list[str], target: str,
                    time_col: str, scaler: StandardScaler,
                    train_cond, val_cond, test_cond, seq_len: int):
    """Build (X_train,y_train, X_val,y_val, X_test,y_test) as float32 arrays."""
    train_df = df[train_cond(df[time_col])]
    val_df   = df[val_cond(df[time_col])]
    test_df  = df[test_cond(df[time_col])]

    scaler.fit(train_df[feat_cols].values)
    tgt_idx = feat_cols.index(target)

    def seqs_for_split(curr_df, prev_df=None):
        Xs, ys = [], []
        for region, grp in curr_df.groupby("marz"):
            grp = grp.sort_values(time_col)
            if prev_df is not None:
                ctx = prev_df[prev_df["marz"] == region].sort_values(time_col).tail(seq_len)
                grp = pd.concat([ctx, grp])
            arr = scaler.transform(grp[feat_cols].fillna(0).values)
            for t in range(seq_len, len(arr)):
                Xs.append(arr[t - seq_len: t])
                ys.append(arr[t, tgt_idx])
        X = np.array(Xs, dtype=np.float32) if Xs else np.zeros((0, seq_len, len(feat_cols)), dtype=np.float32)
        y = np.array(ys, dtype=np.float32) if ys else np.zeros(0, dtype=np.float32)
        return X, y

    X_tr, y_tr = seqs_for_split(train_df)
    X_va, y_va = seqs_for_split(val_df, train_df)
    X_te, y_te = seqs_for_split(test_df, pd.concat([train_df, val_df]))
    return X_tr, y_tr, X_va, y_va, X_te, y_te, scaler, tgt_idx


def _train_nn(model, X_tr, y_tr, X_va, y_va, X_te, y_te,
              scaler, tgt_idx: int, lr=1e-3, max_epochs=120, patience=18, batch=32) -> dict:
    import torch
    import torch.nn as nn
    from torch.utils.data import DataLoader, TensorDataset

    crit = nn.MSELoss()
    opt  = torch.optim.Adam(model.parameters(), lr=lr, weight_decay=1e-4)
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

    if len(X_te) == 0:
        return {"R2": None, "MAE": None, "RMSE": None}

    with torch.no_grad():
        y_s = model(torch.from_numpy(X_te)).numpy()

    mu, sd = scaler.mean_[tgt_idx], scaler.scale_[tgt_idx]
    return metrics(y_te * sd + mu, y_s * sd + mu)


# ── Model definitions ──────────────────────────────────────────────────────────

def build_gru(inp, h=64, layers=2, drop=0.2):
    import torch.nn as nn
    class M(nn.Module):
        def __init__(self):
            super().__init__()
            self.rnn = nn.GRU(inp, h, layers, batch_first=True,
                              dropout=drop if layers > 1 else 0.0)
            self.fc  = nn.Sequential(nn.Linear(h, 32), nn.ReLU(), nn.Linear(32, 1))
        def forward(self, x):
            out, _ = self.rnn(x)
            return self.fc(out[:, -1]).squeeze(-1)
    return M()


def build_bilstm(inp, h=48, layers=2, drop=0.2):
    import torch.nn as nn
    class M(nn.Module):
        def __init__(self):
            super().__init__()
            self.rnn = nn.LSTM(inp, h, layers, batch_first=True, bidirectional=True,
                               dropout=drop if layers > 1 else 0.0)
            self.fc  = nn.Sequential(nn.Linear(h*2, 32), nn.ReLU(), nn.Linear(32, 1))
        def forward(self, x):
            out, _ = self.rnn(x)
            return self.fc(out[:, -1]).squeeze(-1)
    return M()


def build_transformer(inp, d=32, heads=4, layers=2, drop=0.1):
    import torch.nn as nn
    # d must be divisible by heads
    while d % heads != 0:
        d += 1
    class M(nn.Module):
        def __init__(self):
            super().__init__()
            self.proj = nn.Linear(inp, d)
            enc = nn.TransformerEncoderLayer(d, heads, d*4, drop, batch_first=True)
            self.enc = nn.TransformerEncoder(enc, layers)
            self.fc  = nn.Sequential(nn.Linear(d, 16), nn.ReLU(), nn.Linear(16, 1))
        def forward(self, x):
            return self.fc(self.enc(self.proj(x))[:, -1]).squeeze(-1)
    return M()


def build_tcn(inp, channels=(32, 32, 32), ks=3, drop=0.2):
    import torch
    import torch.nn as nn
    import torch.nn.functional as F

    class TCN(nn.Module):
        def __init__(self):
            super().__init__()
            self.layers = nn.ModuleList()
            in_ch = inp
            for i, out_ch in enumerate(channels):
                dil  = 2 ** i
                pad  = (ks - 1) * dil
                self.layers.append(nn.Sequential(
                    nn.Conv1d(in_ch, out_ch, ks, dilation=dil, padding=pad),
                    nn.ReLU(),
                    nn.Dropout(drop),
                ))
                in_ch = out_ch
            self.fc = nn.Linear(channels[-1], 1)

        def forward(self, x):
            # (B, T, F) → (B, F, T)
            x = x.permute(0, 2, 1)
            for layer in self.layers:
                out = layer(x)
                # causal: trim right to match input length
                if out.shape[-1] > x.shape[-1]:
                    out = out[..., :x.shape[-1]]
                x = out
            return self.fc(x.mean(dim=-1)).squeeze(-1)

    return TCN()


# ── Run all NNs for one frequency ─────────────────────────────────────────────

def run_nn_freq(df: pd.DataFrame, target: str, freq: str,
                time_col: str, feat_cols: list[str],
                train_cond, val_cond, test_cond, seq_len: int) -> list[dict]:
    results = []
    scaler = StandardScaler()
    seqs = _make_sequences(df, feat_cols, target, time_col,
                           scaler, train_cond, val_cond, test_cond, seq_len)
    X_tr, y_tr, X_va, y_va, X_te, y_te, scaler, tgt_idx = seqs

    if len(X_tr) == 0 or len(X_te) == 0:
        print(f"  [{freq:<8}] Not enough data for NNs, skipping.")
        return results

    inp = len(feat_cols)

    for name, model in [
        ("GRU",         build_gru(inp)),
        ("BiLSTM",      build_bilstm(inp)),
        ("Transformer", build_transformer(inp)),
        ("TCN",         build_tcn(inp)),
    ]:
        try:
            m = _train_nn(model, X_tr, y_tr, X_va, y_va, X_te, y_te, scaler, tgt_idx)
            print(f"  [{freq:<8}] {name:<13} R²={m.get('R2'):+.4f}  MAE={m.get('MAE'):.4f}")
            results.append({"source": "time_series_nn", "model": name,
                            "target": target, "frequency": freq, **m})
        except Exception as e:
            print(f"  [{freq:<8}] {name} FAILED: {e}")

    return results


# ═══════════════════════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--push", action="store_true")
    args = parser.parse_args()

    print("Loading data…")
    df_y, df_m, df_d = load_data()

    # ── Split conditions ───────────────────────────────────────────────────────
    yr_train = lambda y: y <= 2019
    yr_val   = lambda y: y == 2020
    yr_test  = lambda y: y >= 2021
    mo_train = lambda d: d.dt.year <= 2019
    mo_val   = lambda d: d.dt.year == 2020
    mo_test  = lambda d: d.dt.year >= 2021
    dy_train, dy_val, dy_test = mo_train, mo_val, mo_test

    # ── ACF/PACF ──────────────────────────────────────────────────────────────
    run_acf_pacf(df_y, df_m)

    cls_rows, nn_rows = [], []

    # ═══════ CLASSICAL: POVERTY ════════════════════════════════════════════════
    header("Classical TS — Poverty Rate")

    # Yearly
    print("\n— YEARLY (real observations) —")
    cls_rows.append(lag1_baseline(df_y, TARGET_POVERTY, "yearly", "year", yr_test))
    cls_rows.append(ridge_lags(df_y, TARGET_POVERTY, "yearly", "year",
                               [1, 2], yr_train, yr_test))
    cls_rows.append(ridge_lags(df_y, TARGET_POVERTY, "yearly", "year",
                               [1, 2, 3], yr_train, yr_test))
    cls_rows.append(arima_panel(df_y, TARGET_POVERTY, "yearly", "year",
                                yr_train, yr_test, max_p=2, max_q=2))

    # Monthly
    print("\n— MONTHLY (interpolated) —")
    cls_rows.append(lag1_baseline(df_m, TARGET_POVERTY, "monthly", "date", mo_test))
    cls_rows.append(ridge_lags(df_m, TARGET_POVERTY, "monthly", "date",
                               [1, 3, 6, 12], mo_train, mo_test))
    cls_rows.append(ridge_lags(df_m, TARGET_POVERTY, "monthly", "date",
                               [1, 2, 3, 6], mo_train, mo_test))
    cls_rows.append(arima_panel(df_m, TARGET_POVERTY, "monthly", "date",
                                mo_train, mo_test, max_p=2, max_q=1))

    # Daily — use weekly-sampled (every 7th row) to keep ARIMA tractable
    print("\n— DAILY (interpolated, sampled every 7 days) —")
    df_d7 = (df_d.groupby("marz", group_keys=False)
               .apply(lambda g: g.sort_values("date").iloc[::7])
               .reset_index(drop=True))
    cls_rows.append(lag1_baseline(df_d7, TARGET_POVERTY, "daily", "date", dy_test))
    cls_rows.append(ridge_lags(df_d7, TARGET_POVERTY, "daily", "date",
                               [1, 4, 13], dy_train, dy_test))
    # ARIMA on one representative region (Yerevan) only — too slow for all 11
    print("  [daily   ] ARIMA on Yerevan only (representative)…")
    df_d7_y = df_d7[df_d7["marz"] == "Yerevan"]
    cls_rows.append(arima_panel(df_d7_y, TARGET_POVERTY, "daily", "date",
                                dy_train, dy_test, max_p=2, max_q=1))

    # ═══════ CLASSICAL: STRESS INDEX ═══════════════════════════════════════════
    header("Classical TS — Stress Index")

    print("\n— YEARLY —")
    cls_rows.append(lag1_baseline(df_y, TARGET_STRESS, "yearly", "year", yr_test))
    cls_rows.append(ridge_lags(df_y, TARGET_STRESS, "yearly", "year",
                               [1, 2], yr_train, yr_test))
    cls_rows.append(arima_panel(df_y, TARGET_STRESS, "yearly", "year",
                                yr_train, yr_test, max_p=2, max_q=2))

    print("\n— MONTHLY —")
    cls_rows.append(lag1_baseline(df_m, TARGET_STRESS, "monthly", "date", mo_test))
    cls_rows.append(ridge_lags(df_m, TARGET_STRESS, "monthly", "date",
                               [1, 3, 6, 12], mo_train, mo_test))
    cls_rows.append(arima_panel(df_m, TARGET_STRESS, "monthly", "date",
                                mo_train, mo_test, max_p=2, max_q=1))

    # ═══════ NEURAL NETWORKS: POVERTY ══════════════════════════════════════════
    header("Neural Networks — Poverty Rate")

    FEAT_M = ["poverty_rate", "crime_rate_per_100k", "hospitals_per_100k",
              "beds_per_10k", "population"]
    FEAT_Y = ["poverty_rate", "crime_rate_per_100k", "hospitals_per_100k", "beds_per_10k"]

    # Yearly NNs: make a date column from year
    df_y2 = df_y.copy()
    df_y2["date"] = pd.to_datetime(df_y2["year"].astype(str) + "-07-01")
    for col in FEAT_Y:
        df_y2[col] = df_y2.groupby("marz")[col].transform(lambda s: s.ffill().bfill())

    print("\n— YEARLY (seq_len=3) —")
    nn_rows += run_nn_freq(df_y2, TARGET_POVERTY, "yearly", "date", FEAT_Y,
                           lambda d: d.dt.year <= 2019,
                           lambda d: d.dt.year == 2020,
                           lambda d: d.dt.year >= 2021,
                           seq_len=3)

    print("\n— MONTHLY (seq_len=12) —")
    nn_rows += run_nn_freq(df_m, TARGET_POVERTY, "monthly", "date", FEAT_M,
                           mo_train, mo_val, mo_test, seq_len=12)

    print("\n— DAILY sampled (seq_len=12) —")
    nn_rows += run_nn_freq(df_d7, TARGET_POVERTY, "daily", "date", FEAT_M,
                           dy_train, dy_val, dy_test, seq_len=12)

    # ═══════ NEURAL NETWORKS: STRESS INDEX ══════════════════════════════════════
    header("Neural Networks — Stress Index")

    FEAT_ST = ["stress_index", "poverty_rate", "crime_rate_per_100k", "hospitals_per_100k"]
    for col in FEAT_ST:
        if col not in df_y2.columns:
            df_y2[col] = 0.0

    print("\n— YEARLY (seq_len=3) —")
    nn_rows += run_nn_freq(df_y2, TARGET_STRESS, "yearly", "date", FEAT_ST,
                           lambda d: d.dt.year <= 2019,
                           lambda d: d.dt.year == 2020,
                           lambda d: d.dt.year >= 2021,
                           seq_len=3)

    print("\n— MONTHLY (seq_len=12) —")
    nn_rows += run_nn_freq(df_m, TARGET_STRESS, "monthly", "date", FEAT_ST,
                           mo_train, mo_val, mo_test, seq_len=12)

    # ── Save CSVs ──────────────────────────────────────────────────────────────
    cls_rows = [r for r in cls_rows if r]
    nn_rows  = [r for r in nn_rows  if r]

    df_cls = pd.DataFrame(cls_rows)
    df_nn  = pd.DataFrame(nn_rows)

    cls_path = RESULTS_DIR / "ts_classical_results.csv"
    nn_path  = RESULTS_DIR / "ts_nn_results.csv"
    df_cls.to_csv(cls_path, index=False)
    df_nn.to_csv(nn_path,  index=False)

    header("Summary")
    print("\n── Classical ──")
    print(df_cls[["model","target","frequency","R2","MAE"]].to_string(index=False))
    print("\n── Neural Networks ──")
    if df_nn.empty:
        print("  (no results — all NN runs skipped or failed)")
    else:
        print(df_nn[["model","target","frequency","R2","MAE"]].to_string(index=False))
    print(f"\nSaved: {cls_path}\nSaved: {nn_path}")

    if args.push:
        push_to_db(df_cls, df_nn)


# ═══════════════════════════════════════════════════════════════════════════════
# DB PUSH
# ═══════════════════════════════════════════════════════════════════════════════

def push_to_db(df_cls: pd.DataFrame, df_nn: pd.DataFrame):
    header("Pushing to DB")
    import psycopg2

    db_url = os.environ.get(
        "DATABASE_URL",
        "postgresql://postgres:admin@localhost:5432/capstone",
    )
    conn = psycopg2.connect(db_url)
    cur  = conn.cursor()

    cur.execute(
        "DELETE FROM capstone.forecasting_results "
        "WHERE source IN ('time_series_classical','time_series_nn')"
    )
    print("  Cleared old rows.")

    sql = ("INSERT INTO capstone.forecasting_results (source, model, frequency, r2, mae) "
           "VALUES (%s, %s, %s, %s, %s)")

    n = 0
    for source_df, source_key in [(df_cls, "time_series_classical"), (df_nn, "time_series_nn")]:
        for _, row in source_df.iterrows():
            tag   = " [stress]" if row.get("target") == TARGET_STRESS else " [poverty]"
            model = str(row["model"]) + tag
            r2    = float(row["R2"])  if pd.notna(row.get("R2"))  else None
            mae   = float(row["MAE"]) if pd.notna(row.get("MAE")) else None
            freq  = str(row["frequency"]) if pd.notna(row.get("frequency")) else None
            cur.execute(sql, (source_key, model, freq, r2, mae))
            n += 1

    conn.commit()
    cur.close()
    conn.close()
    print(f"  Inserted {n} rows into capstone.forecasting_results.")


if __name__ == "__main__":
    main()
