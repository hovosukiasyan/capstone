#!/usr/bin/env python3
"""
Future Poverty & Stress Forecast: 2023–2026
============================================
Trains Ridge autoregressive (lags 1, 2) + GRU ensemble on the full 2016–2022
ILCS yearly panel, then rolls each model forward year-by-year to 2026.
Each year's prediction feeds into the next input — true recursive multi-step
forecasting. Results are population-weighted into a national Armenia average.

Outputs
-------
  data/processed/results/forecast_2023_2026.csv
      Columns: marz, year, poverty_rate, stress_index,
               poverty_low, poverty_high, stress_low, stress_high,
               is_forecast, model
      Rows: 2016–2026 × 12 entities (11 marzes + national aggregate)

  data/processed/results/forecast_plots/
      poverty_forecast.png  — 11-region grid + national, poverty rate
      stress_forecast.png   — 11-region grid + national, stress index

Usage
-----
  python3.11 scripts/08_forecast_future.py          # forecast only
  python3.11 scripts/08_forecast_future.py --push   # + upsert into DB
"""
from __future__ import annotations

import argparse
import os
import sys
import warnings
from pathlib import Path

warnings.filterwarnings("ignore")

import numpy as np
import pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from sklearn.linear_model import Ridge
from sklearn.preprocessing import StandardScaler

# ── Paths ──────────────────────────────────────────────────────────────────────
ROOT        = Path(__file__).resolve().parent.parent
PANEL_PATH  = ROOT / "data/processed/panel/marz_year_panel_common_with_stress.csv"
RESULTS_DIR = ROOT / "data/processed/results"
PLOTS_DIR   = RESULTS_DIR / "forecast_plots"
OUT_CSV     = RESULTS_DIR / "forecast_2023_2026.csv"
RESULTS_DIR.mkdir(parents=True, exist_ok=True)
PLOTS_DIR.mkdir(parents=True, exist_ok=True)

FORECAST_YEARS = [2023, 2024, 2025, 2026]
HISTORY_START  = 2016
SEED           = 42
np.random.seed(SEED)

# Feature columns used as sequence input for the GRU
GRU_FEATS = ["poverty_rate", "stress_index", "crime_rate_per_100k",
             "hospitals_per_100k", "beds_per_10k"]
SEQ_LEN   = 3   # look back 3 years


# ═══════════════════════════════════════════════════════════════════════════════
# DATA LOADING
# ═══════════════════════════════════════════════════════════════════════════════

def load_panel() -> pd.DataFrame:
    df = pd.read_csv(PANEL_PATH)
    df = df.sort_values(["marz", "year"]).reset_index(drop=True)

    # Forward-fill missing auxiliary columns per region
    fill_cols = ["poverty_rate", "stress_index", "crime_rate_per_100k",
                 "hospitals_per_100k", "beds_per_10k", "population"]
    for col in fill_cols:
        if col in df.columns:
            df[col] = df.groupby("marz")[col].transform(lambda s: s.ffill().bfill())

    print(f"Loaded panel: {df.shape[0]} rows, {df['marz'].nunique()} regions, "
          f"years {df['year'].min()}–{df['year'].max()}")
    return df


# ═══════════════════════════════════════════════════════════════════════════════
# RIDGE AUTOREGRESSIVE MODEL
# ═══════════════════════════════════════════════════════════════════════════════

def fit_ridge_per_region(df: pd.DataFrame) -> dict:
    """
    For each region, fit one Ridge model per target (poverty_rate, stress_index)
    using lag-1 and lag-2 features of both targets.
    Returns {region: {'poverty': RidgeModel, 'stress': RidgeModel,
                       'last_vals': pd.Series(year->{'poverty':..., 'stress':...})}}
    """
    models = {}
    for region, grp in df.groupby("marz"):
        grp = grp.sort_values("year").reset_index(drop=True)
        pov  = grp["poverty_rate"].values.astype(float)
        strs = grp["stress_index"].values.astype(float)
        n    = len(pov)

        # Build lag matrix: [poverty_lag1, poverty_lag2, stress_lag1, stress_lag2]
        X_rows, y_pov, y_str = [], [], []
        for t in range(2, n):
            X_rows.append([pov[t-1], pov[t-2], strs[t-1], strs[t-2]])
            y_pov.append(pov[t])
            y_str.append(strs[t])

        X = np.array(X_rows, dtype=float)
        if len(X) < 2:
            continue

        r_pov  = Ridge(alpha=1.0).fit(X, y_pov)
        r_str  = Ridge(alpha=1.0).fit(X, y_str)

        models[region] = {
            "poverty": r_pov,
            "stress":  r_str,
            # last two observed values for rolling kickoff
            "pov_hist":  list(pov),
            "str_hist":  list(strs),
            "years":     list(grp["year"].values),
        }
    return models


def ridge_residuals(df: pd.DataFrame) -> dict[str, dict[str, float]]:
    """
    Leave-last-3-years-out: train on ≤2019, roll-forecast 2020–2022,
    compute per-horizon RMSE to scale confidence bands.
    Returns {region: {'poverty': sigma_vec, 'stress': sigma_vec}} where
    sigma_vec[h] = RMSE at forecast horizon h+1.
    """
    sigmas: dict[str, dict] = {}
    for region, grp in df.groupby("marz"):
        grp   = grp.sort_values("year").reset_index(drop=True)
        years = grp["year"].values
        pov   = grp["poverty_rate"].values.astype(float)
        strs  = grp["stress_index"].values.astype(float)

        train_mask = years <= 2019
        if train_mask.sum() < 3:
            sigmas[region] = {"poverty": np.array([5.0, 6.0, 7.0, 8.0]),
                              "stress":  np.array([0.5, 0.6, 0.7, 0.8])}
            continue

        # Build training lag matrix
        tr_pov  = pov[train_mask]
        tr_strs = strs[train_mask]
        X_tr, yp_tr, ys_tr = [], [], []
        for t in range(2, len(tr_pov)):
            X_tr.append([tr_pov[t-1], tr_pov[t-2], tr_strs[t-1], tr_strs[t-2]])
            yp_tr.append(tr_pov[t])
            ys_tr.append(tr_strs[t])

        if len(X_tr) < 2:
            sigmas[region] = {"poverty": np.array([5.0, 6.0, 7.0, 8.0]),
                              "stress":  np.array([0.5, 0.6, 0.7, 0.8])}
            continue

        r_pov = Ridge(alpha=1.0).fit(np.array(X_tr), yp_tr)
        r_str = Ridge(alpha=1.0).fit(np.array(X_tr), ys_tr)

        # Rolling forecast over 2020–2022
        rolling_pov  = list(tr_pov)
        rolling_strs = list(tr_strs)
        val_years    = years[~train_mask]
        val_pov      = pov[~train_mask]
        val_strs     = strs[~train_mask]

        err_pov, err_str = [], []
        for h, _ in enumerate(val_years):
            feat = [[rolling_pov[-1], rolling_pov[-2],
                     rolling_strs[-1], rolling_strs[-2]]]
            p_pred = float(r_pov.predict(feat)[0])
            s_pred = float(r_str.predict(feat)[0])
            err_pov.append(abs(val_pov[h] - p_pred))
            err_str.append(abs(val_strs[h] - s_pred))
            rolling_pov.append(val_pov[h])   # use actuals in residual calc
            rolling_strs.append(val_strs[h])

        # Expand CI for longer horizons: sigma * sqrt(h)
        base_pov  = float(np.mean(err_pov)) if err_pov else 5.0
        base_str  = float(np.mean(err_str)) if err_str else 0.5
        horizons  = np.arange(1, 5)
        sigmas[region] = {
            "poverty": base_pov  * np.sqrt(horizons),
            "stress":  base_str  * np.sqrt(horizons),
        }

    return sigmas


def forecast_ridge(models: dict, sigmas: dict) -> pd.DataFrame:
    """Roll each region's Ridge forward 2023–2026. Returns forecast rows."""
    rows = []
    for region, m in models.items():
        pov_hist  = list(m["pov_hist"])
        str_hist  = list(m["str_hist"])
        sig_pov   = sigmas.get(region, {}).get("poverty", np.array([5., 6., 7., 8.]))
        sig_str   = sigmas.get(region, {}).get("stress",  np.array([.5, .6, .7, .8]))

        for h, year in enumerate(FORECAST_YEARS):
            feat = [[pov_hist[-1], pov_hist[-2], str_hist[-1], str_hist[-2]]]
            p = float(m["poverty"].predict(feat)[0])
            s = float(m["stress"].predict(feat)[0])
            # Clamp poverty rate to [0, 100]
            p = max(0.0, min(100.0, p))
            si = sig_pov[h] if h < len(sig_pov) else sig_pov[-1]
            ss = sig_str[h] if h < len(sig_str) else sig_str[-1]
            rows.append({
                "marz": region, "year": year,
                "poverty_rate": p,        "stress_index": s,
                "poverty_low":  p - 1.645 * si,  "poverty_high": p + 1.645 * si,
                "stress_low":   s - 1.645 * ss,  "stress_high":  s + 1.645 * ss,
                "is_forecast": 1, "model": "Ridge",
            })
            pov_hist.append(p)
            str_hist.append(s)

    return pd.DataFrame(rows)


# ═══════════════════════════════════════════════════════════════════════════════
# GRU MODEL
# ═══════════════════════════════════════════════════════════════════════════════

def _build_gru(n_feats: int, hidden: int = 48, layers: int = 2, drop: float = 0.2):
    import torch.nn as nn
    class GRUModel(nn.Module):
        def __init__(self):
            super().__init__()
            self.rnn = nn.GRU(n_feats, hidden, layers, batch_first=True,
                              dropout=drop if layers > 1 else 0.0)
            self.fc  = nn.Sequential(nn.Linear(hidden, 16), nn.ReLU(), nn.Linear(16, 1))
        def forward(self, x):
            out, _ = self.rnn(x)
            return self.fc(out[:, -1]).squeeze(-1)
    return GRUModel()


def _train_gru_region(X_tr: np.ndarray, y_tr: np.ndarray,
                      lr: float = 5e-3, epochs: int = 200, patience: int = 30) -> object:
    """Train a tiny GRU on a single region's sequence data."""
    import torch
    import torch.nn as nn
    from torch.utils.data import DataLoader, TensorDataset

    if len(X_tr) == 0:
        return None

    model = _build_gru(X_tr.shape[2])
    crit  = nn.MSELoss()
    opt   = torch.optim.Adam(model.parameters(), lr=lr, weight_decay=1e-3)

    X_t = torch.from_numpy(X_tr.astype(np.float32))
    y_t = torch.from_numpy(y_tr.astype(np.float32))
    dl  = DataLoader(TensorDataset(X_t, y_t), batch_size=min(16, len(X_tr)), shuffle=True)

    best_loss, best_state, wait = np.inf, None, 0
    for _ in range(epochs):
        model.train()
        epoch_loss = 0.0
        for xb, yb in dl:
            opt.zero_grad()
            loss = crit(model(xb), yb)
            loss.backward()
            nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            opt.step()
            epoch_loss += loss.item()
        if epoch_loss < best_loss:
            best_loss  = epoch_loss
            best_state = {k: v.clone() for k, v in model.state_dict().items()}
            wait = 0
        else:
            wait += 1
        if wait >= patience:
            break

    model.load_state_dict(best_state)
    model.eval()
    return model


def fit_gru_per_region(df: pd.DataFrame):
    """
    For each region, build lag sequences (seq_len=3) over 2016–2022 and train
    two small GRUs (one for poverty, one for stress).
    Returns {region: {'pov_model', 'str_model', 'scaler_pov', 'scaler_str',
                       'feat_hist': array (year, feats), 'years': list}}
    """
    try:
        import torch  # noqa: F401
    except ImportError:
        print("  [GRU] torch not available — skipping GRU arm")
        return {}

    gru_models = {}
    for region, grp in df.groupby("marz"):
        grp  = grp.sort_values("year").reset_index(drop=True)
        arr  = grp[GRU_FEATS].values.astype(float)  # (T, n_feats)
        n    = len(arr)

        if n < SEQ_LEN + 1:
            continue

        # Normalise features
        sc_all = StandardScaler().fit(arr)
        arr_s  = sc_all.transform(arr)

        pov_idx = GRU_FEATS.index("poverty_rate")
        str_idx = GRU_FEATS.index("stress_index")

        # Build sequences
        Xs, yp, ys = [], [], []
        for t in range(SEQ_LEN, n):
            Xs.append(arr_s[t - SEQ_LEN: t])
            yp.append(arr_s[t, pov_idx])
            ys.append(arr_s[t, str_idx])

        X_np = np.array(Xs, dtype=np.float32)
        yp_np = np.array(yp, dtype=np.float32)
        ys_np = np.array(ys, dtype=np.float32)

        pov_model = _train_gru_region(X_np, yp_np)
        str_model = _train_gru_region(X_np, ys_np)

        gru_models[region] = {
            "pov_model": pov_model,
            "str_model": str_model,
            "scaler":    sc_all,
            "feat_hist": arr.copy(),   # (T, n_feats) — raw, unscaled
            "years":     list(grp["year"].values),
            "pov_idx":   pov_idx,
            "str_idx":   str_idx,
        }

    return gru_models


def forecast_gru(gru_models: dict, sigmas: dict) -> pd.DataFrame:
    """Roll each region's GRU forward 2023–2026. Returns forecast rows."""
    try:
        import torch
    except ImportError:
        return pd.DataFrame()

    rows = []
    for region, m in gru_models.items():
        if m["pov_model"] is None or m["str_model"] is None:
            continue

        feat_hist = m["feat_hist"].copy()  # (T, n_feats)
        sc        = m["scaler"]
        pov_idx   = m["pov_idx"]
        str_idx   = m["str_idx"]
        sig_pov   = sigmas.get(region, {}).get("poverty", np.array([5., 6., 7., 8.]))
        sig_str   = sigmas.get(region, {}).get("stress",  np.array([.5, .6, .7, .8]))

        for h, year in enumerate(FORECAST_YEARS):
            # Last SEQ_LEN rows of feat_hist, normalised
            window_raw = feat_hist[-SEQ_LEN:]  # (SEQ_LEN, n_feats)
            window_s   = sc.transform(window_raw)
            X_t = torch.from_numpy(window_s[np.newaxis].astype(np.float32))

            with torch.no_grad():
                p_s = float(m["pov_model"](X_t).item())
                s_s = float(m["str_model"](X_t).item())

            # Inverse normalise
            dummy = np.zeros((1, len(GRU_FEATS)))
            dummy[0, pov_idx] = p_s
            dummy[0, str_idx] = s_s
            raw = sc.inverse_transform(dummy)[0]
            p = max(0.0, min(100.0, raw[pov_idx]))
            s = raw[str_idx]

            si = sig_pov[h] if h < len(sig_pov) else sig_pov[-1]
            ss = sig_str[h] if h < len(sig_str) else sig_str[-1]

            rows.append({
                "marz": region, "year": year,
                "poverty_rate": p,        "stress_index": s,
                "poverty_low":  p - 1.645 * si,  "poverty_high": p + 1.645 * si,
                "stress_low":   s - 1.645 * ss,  "stress_high":  s + 1.645 * ss,
                "is_forecast": 1, "model": "GRU",
            })

            # Append predicted values to feat_hist for next step
            new_row      = feat_hist[-1].copy()
            new_row[pov_idx] = p
            new_row[str_idx] = s
            feat_hist = np.vstack([feat_hist, new_row])

    return pd.DataFrame(rows)


# ═══════════════════════════════════════════════════════════════════════════════
# ENSEMBLE: RIDGE + GRU  (50 / 50 average)
# ═══════════════════════════════════════════════════════════════════════════════

def ensemble_forecasts(df_ridge: pd.DataFrame, df_gru: pd.DataFrame) -> pd.DataFrame:
    """
    Average Ridge and GRU predictions where both exist; fall back to Ridge only
    when GRU is unavailable (small-data region or torch missing).
    """
    if df_gru.empty:
        df_ridge = df_ridge.copy()
        df_ridge["model"] = "Ridge"
        return df_ridge

    merge_cols = ["marz", "year"]
    val_cols   = ["poverty_rate", "stress_index",
                  "poverty_low", "poverty_high", "stress_low", "stress_high"]

    r = df_ridge[merge_cols + val_cols].copy()
    g = df_gru[merge_cols + val_cols].copy()

    merged = r.merge(g, on=merge_cols, how="outer", suffixes=("_r", "_g"))

    rows = []
    for _, row in merged.iterrows():
        out: dict = {"marz": row["marz"], "year": row["year"],
                     "is_forecast": 1, "model": "Ensemble"}
        for col in val_cols:
            rv = row.get(f"{col}_r", np.nan)
            gv = row.get(f"{col}_g", np.nan)
            if pd.notna(rv) and pd.notna(gv):
                out[col] = 0.5 * rv + 0.5 * gv
            elif pd.notna(rv):
                out[col] = rv
            else:
                out[col] = gv
        rows.append(out)

    return pd.DataFrame(rows)


# ═══════════════════════════════════════════════════════════════════════════════
# NATIONAL AGGREGATE  (population-weighted)
# ═══════════════════════════════════════════════════════════════════════════════

def national_aggregate(df_hist: pd.DataFrame, df_fc: pd.DataFrame) -> pd.DataFrame:
    """
    Build Armenia-level rows: population-weighted mean across regions.
    Uses the most recent known population weight for forecast years.
    """
    # Weights from last observed year
    pop_weights = (df_hist.sort_values("year")
                          .drop_duplicates("marz", keep="last")
                          .set_index("marz")["population"])
    total_pop = pop_weights.sum()
    weights   = (pop_weights / total_pop).to_dict()

    nat_rows = []
    for df, is_fc in [(df_hist, 0), (df_fc, 1)]:
        for year, grp in df.groupby("year"):
            w = np.array([weights.get(m, 1.0 / len(grp)) for m in grp["marz"]])
            w /= w.sum()
            row: dict = {"marz": "Armenia (national)", "year": year,
                         "is_forecast": is_fc}
            for col in ["poverty_rate", "stress_index"]:
                if col in grp.columns:
                    row[col] = float(np.average(grp[col].values, weights=w))
            if is_fc:
                row["model"] = grp["model"].iloc[0] if "model" in grp.columns else "Ensemble"
                for col in ["poverty_low", "poverty_high", "stress_low", "stress_high"]:
                    if col in grp.columns:
                        row[col] = float(np.average(grp[col].values, weights=w))
            else:
                for col in ["poverty_low", "poverty_high", "stress_low", "stress_high"]:
                    row[col] = np.nan
                row["model"] = "actual"
            nat_rows.append(row)

    return pd.DataFrame(nat_rows)


# ═══════════════════════════════════════════════════════════════════════════════
# COMBINE HISTORICAL + FORECAST INTO ONE TABLE
# ═══════════════════════════════════════════════════════════════════════════════

def build_full_table(df_hist: pd.DataFrame, df_fc: pd.DataFrame) -> pd.DataFrame:
    hist_rows = []
    for _, row in df_hist.iterrows():
        hist_rows.append({
            "marz":          row["marz"],
            "year":          int(row["year"]),
            "poverty_rate":  row["poverty_rate"],
            "stress_index":  row["stress_index"],
            "poverty_low":   np.nan, "poverty_high": np.nan,
            "stress_low":    np.nan, "stress_high":  np.nan,
            "is_forecast":   0,
            "model":         "actual",
        })

    fc_rows = df_fc.copy()
    fc_rows["year"] = fc_rows["year"].astype(int)

    nat = national_aggregate(df_hist, df_fc)

    full = pd.concat([
        pd.DataFrame(hist_rows),
        fc_rows,
        nat,
    ], ignore_index=True)

    return full.sort_values(["marz", "year"]).reset_index(drop=True)


# ═══════════════════════════════════════════════════════════════════════════════
# PLOTTING
# ═══════════════════════════════════════════════════════════════════════════════

REGION_ORDER = [
    "Yerevan", "Aragatsotn", "Ararat", "Armavir", "Gegharkunik",
    "Lori", "Kotayk", "Shirak", "Syunik", "Vayots Dzor", "Tavush",
]

def _plot_target(full_df: pd.DataFrame, target: str,
                 ci_low: str, ci_high: str,
                 ylabel: str, fname: str) -> None:
    regions  = [r for r in REGION_ORDER if r in full_df["marz"].unique()]
    n_region = len(regions)
    cols     = 3
    rows_g   = -(-n_region // cols)     # ceiling division

    # Extra row for the national chart
    fig, axes = plt.subplots(rows_g + 1, cols,
                             figsize=(5 * cols, 3.5 * (rows_g + 1)),
                             constrained_layout=True)
    fig.patch.set_facecolor("#F9F7F4")

    cut_year = 2022   # history ends here

    def draw_panel(ax, region: str, title_size: int = 8):
        sub_h = full_df[(full_df["marz"] == region) & (full_df["is_forecast"] == 0)].sort_values("year")
        sub_f = full_df[(full_df["marz"] == region) & (full_df["is_forecast"] == 1)].sort_values("year")

        ax.set_facecolor("#FDFCFA")
        for spine in ax.spines.values():
            spine.set_color("#D8D3CC")

        # Solid history line
        if not sub_h.empty:
            ax.plot(sub_h["year"], sub_h[target],
                    color="#4A6FA5", linewidth=1.8, label="Historical", zorder=3)
            ax.scatter(sub_h["year"], sub_h[target],
                       color="#4A6FA5", s=28, zorder=4)

        # Dashed forecast line
        if not sub_f.empty:
            # Connect history tail to forecast head
            if not sub_h.empty:
                conn_x = [sub_h["year"].iloc[-1], sub_f["year"].iloc[0]]
                conn_y = [sub_h[target].iloc[-1],  sub_f[target].iloc[0]]
                ax.plot(conn_x, conn_y, color="#C07A2A", linewidth=1.5,
                        linestyle="dashed", zorder=3)

            ax.plot(sub_f["year"], sub_f[target],
                    color="#C07A2A", linewidth=1.8, linestyle="dashed",
                    label="Forecast", zorder=3)
            ax.scatter(sub_f["year"], sub_f[target],
                       color="#C07A2A", s=28, zorder=4)

            # Confidence ribbon
            ax.fill_between(sub_f["year"], sub_f[ci_low], sub_f[ci_high],
                            color="#C07A2A", alpha=0.13, zorder=2)

        # Vertical divider
        ax.axvline(cut_year + 0.5, color="#888", linewidth=0.9,
                   linestyle=":", zorder=1)

        ax.set_title(region, fontsize=title_size, pad=3,
                     fontfamily="sans-serif", color="#333")
        ax.set_xticks(range(HISTORY_START, FORECAST_YEARS[-1] + 1, 2))
        ax.tick_params(axis="both", labelsize=7, colors="#555")
        ax.set_xlabel("")
        ax.grid(alpha=0.25, linewidth=0.5)

    # Per-region panels
    for idx, region in enumerate(regions):
        r, c = divmod(idx, cols)
        draw_panel(axes[r][c], region)

    # Hide unused region panels in last row
    for unused in range(n_region, rows_g * cols):
        r, c = divmod(unused, cols)
        axes[r][c].set_visible(False)

    # National aggregate — spans full last row
    nat_sub = full_df[full_df["marz"] == "Armenia (national)"].sort_values("year")
    ax_nat  = fig.add_subplot(rows_g + 1, 1, rows_g + 1)

    nat_h = nat_sub[nat_sub["is_forecast"] == 0]
    nat_f = nat_sub[nat_sub["is_forecast"] == 1]

    ax_nat.set_facecolor("#F9F7F4")
    for spine in ax_nat.spines.values():
        spine.set_color("#D8D3CC")

    # Draw all region faint lines for context
    for region in regions:
        sub_r = full_df[full_df["marz"] == region].sort_values("year")
        ax_nat.plot(sub_r["year"], sub_r[target],
                    color="#AAAAAA", linewidth=0.6, alpha=0.4, zorder=1)

    if not nat_h.empty:
        ax_nat.plot(nat_h["year"], nat_h[target],
                    color="#4A6FA5", linewidth=2.2, label="Armenia (population-weighted)", zorder=3)
        ax_nat.scatter(nat_h["year"], nat_h[target], color="#4A6FA5", s=36, zorder=4)

    if not nat_f.empty:
        if not nat_h.empty:
            conn_x = [nat_h["year"].iloc[-1], nat_f["year"].iloc[0]]
            conn_y = [nat_h[target].iloc[-1],  nat_f[target].iloc[0]]
            ax_nat.plot(conn_x, conn_y, color="#C07A2A", linewidth=2,
                        linestyle="dashed", zorder=3)
        ax_nat.plot(nat_f["year"], nat_f[target],
                    color="#C07A2A", linewidth=2.2, linestyle="dashed",
                    label="Forecast", zorder=3)
        ax_nat.scatter(nat_f["year"], nat_f[target], color="#C07A2A", s=36, zorder=4)
        ax_nat.fill_between(nat_f["year"], nat_f[ci_low], nat_f[ci_high],
                            color="#C07A2A", alpha=0.13, zorder=2)

    ax_nat.axvline(cut_year + 0.5, color="#888", linewidth=1.0,
                   linestyle=":", zorder=1)
    ax_nat.set_title("Armenia — National Aggregate (population-weighted)",
                     fontsize=9, pad=4, fontfamily="sans-serif", color="#333")
    ax_nat.set_xticks(range(HISTORY_START, FORECAST_YEARS[-1] + 1))
    ax_nat.tick_params(axis="both", labelsize=8, colors="#555")
    ax_nat.set_ylabel(ylabel, fontsize=8, color="#555")
    ax_nat.legend(fontsize=7, framealpha=0.7)
    ax_nat.grid(alpha=0.25, linewidth=0.5)

    out_path = PLOTS_DIR / fname
    plt.savefig(out_path, dpi=130, bbox_inches="tight", facecolor=fig.get_facecolor())
    plt.close()
    print(f"  Plot saved → {out_path}")


def generate_plots(full_df: pd.DataFrame) -> None:
    print("\nGenerating forecast plots…")
    _plot_target(full_df, "poverty_rate", "poverty_low", "poverty_high",
                 "Poverty Rate (%)", "poverty_forecast.png")
    _plot_target(full_df, "stress_index", "stress_low", "stress_high",
                 "Stress Index", "stress_forecast.png")


# ═══════════════════════════════════════════════════════════════════════════════
# PRINT SUMMARY
# ═══════════════════════════════════════════════════════════════════════════════

def print_summary(full_df: pd.DataFrame) -> None:
    fc = full_df[full_df["is_forecast"] == 1]
    print("\n── Forecast 2023–2026 by region (poverty rate) ──")
    pivot = fc.pivot_table(index="marz", columns="year",
                           values="poverty_rate", aggfunc="mean")
    print(pivot.round(1).to_string())

    print("\n── National aggregate ──")
    nat = full_df[full_df["marz"] == "Armenia (national)"].sort_values("year")
    print(nat[["year", "poverty_rate", "poverty_low", "poverty_high",
               "stress_index", "is_forecast"]].round(2).to_string(index=False))


# ═══════════════════════════════════════════════════════════════════════════════
# DB PUSH
# ═══════════════════════════════════════════════════════════════════════════════

def push_to_db(full_df: pd.DataFrame) -> None:
    import psycopg2

    db_url = os.environ.get(
        "DATABASE_URL",
        "postgresql://postgres:admin@localhost:5432/capstone",
    )
    conn = psycopg2.connect(db_url)
    cur  = conn.cursor()

    cur.execute("""
        CREATE TABLE IF NOT EXISTS capstone.poverty_forecast (
            marz              TEXT,
            year              INT,
            poverty_rate      DOUBLE PRECISION,
            stress_index      DOUBLE PRECISION,
            poverty_low       DOUBLE PRECISION,
            poverty_high      DOUBLE PRECISION,
            stress_low        DOUBLE PRECISION,
            stress_high       DOUBLE PRECISION,
            is_forecast       SMALLINT,
            model             TEXT,
            PRIMARY KEY (marz, year)
        )
    """)
    cur.execute("TRUNCATE TABLE capstone.poverty_forecast")

    sql = """
        INSERT INTO capstone.poverty_forecast
            (marz, year, poverty_rate, stress_index,
             poverty_low, poverty_high, stress_low, stress_high,
             is_forecast, model)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (marz, year) DO UPDATE SET
            poverty_rate = EXCLUDED.poverty_rate,
            stress_index = EXCLUDED.stress_index,
            poverty_low  = EXCLUDED.poverty_low,
            poverty_high = EXCLUDED.poverty_high,
            stress_low   = EXCLUDED.stress_low,
            stress_high  = EXCLUDED.stress_high,
            is_forecast  = EXCLUDED.is_forecast,
            model        = EXCLUDED.model
    """

    def _f(v):
        return None if (v is None or (isinstance(v, float) and np.isnan(v))) else float(v)

    n = 0
    for _, row in full_df.iterrows():
        cur.execute(sql, (
            str(row["marz"]),
            int(row["year"]),
            _f(row.get("poverty_rate")),
            _f(row.get("stress_index")),
            _f(row.get("poverty_low")),
            _f(row.get("poverty_high")),
            _f(row.get("stress_low")),
            _f(row.get("stress_high")),
            int(row.get("is_forecast", 0)),
            str(row.get("model", "actual")),
        ))
        n += 1

    conn.commit()
    cur.close()
    conn.close()
    print(f"\n  Pushed {n} rows → capstone.poverty_forecast")


# ═══════════════════════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════════════════════

def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--push",   action="store_true",
                        help="Upsert results into capstone.poverty_forecast DB table")
    parser.add_argument("--no-gru", action="store_true",
                        help="Skip GRU arm (faster, Ridge-only forecast)")
    args = parser.parse_args()

    # ── Load data ──────────────────────────────────────────────────────────────
    df = load_panel()
    hist_cols = ["marz", "year", "poverty_rate", "stress_index", "population",
                 "crime_rate_per_100k", "hospitals_per_100k", "beds_per_10k"]
    df_hist = df[[c for c in hist_cols if c in df.columns]].copy()

    # ── Compute residual sigmas for confidence bands ───────────────────────────
    print("\nEstimating forecast uncertainty (leave-last-3-years-out)…")
    sigmas = ridge_residuals(df_hist)

    # ── Ridge forecast ─────────────────────────────────────────────────────────
    print("\nFitting Ridge autoregressive models…")
    ridge_models = fit_ridge_per_region(df_hist)
    df_ridge     = forecast_ridge(ridge_models, sigmas)
    print(f"  Ridge: {len(df_ridge)} forecast rows across {df_ridge['marz'].nunique()} regions")

    # ── GRU forecast ───────────────────────────────────────────────────────────
    df_gru = pd.DataFrame()
    if not args.no_gru:
        print("\nFitting GRU models per region…")
        gru_models = fit_gru_per_region(df_hist)
        if gru_models:
            df_gru = forecast_gru(gru_models, sigmas)
            print(f"  GRU:   {len(df_gru)} forecast rows across {df_gru['marz'].nunique()} regions")
        else:
            print("  GRU skipped (torch unavailable or insufficient data)")
    else:
        print("\nGRU skipped (--no-gru flag)")

    # ── Ensemble ───────────────────────────────────────────────────────────────
    print("\nEnsembling Ridge + GRU…")
    df_fc = ensemble_forecasts(df_ridge, df_gru)

    # ── Assemble full 2016–2026 table ─────────────────────────────────────────
    full_df = build_full_table(df_hist, df_fc)

    # ── Save CSV ───────────────────────────────────────────────────────────────
    full_df.to_csv(OUT_CSV, index=False)
    print(f"\nSaved: {OUT_CSV}  ({len(full_df)} rows)")

    # ── Plots ──────────────────────────────────────────────────────────────────
    generate_plots(full_df)

    # ── Summary table ─────────────────────────────────────────────────────────
    print_summary(full_df)

    # ── Optional DB push ───────────────────────────────────────────────────────
    if args.push:
        push_to_db(full_df)


if __name__ == "__main__":
    main()
