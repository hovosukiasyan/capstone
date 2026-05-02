#!/usr/bin/env python3
"""
2022 Forecast Validation — Multi-Model
=======================================
Three models compared on a held-out 2022 test:

  Lag-1 Baseline   : predict(2022) = actual(2021)   — simplest possible
  Ridge AR         : lag-1 + lag-2 of both targets   — autoregressive
  Ensemble         : 50/50 of Lag-1 + Ridge          — hedged combination

Training window : 2016–2021
Test year       : 2022
Geography       : 11 Armenian marzes + national aggregate

All predictions are clamped to [0, 100] for poverty_rate.

Output
------
  data/processed/results/forecast_validation_2022.csv
    Columns: marz, target, actual_2022, predicted_2022,
             signed_error, absolute_error, percent_error, model
    Rows   : 11 marzes × 2 targets × 3 models + 1 national × 2 targets × 3 models = 72 rows
"""
from __future__ import annotations

import warnings
from pathlib import Path

warnings.filterwarnings("ignore")

import numpy as np
import pandas as pd
from sklearn.linear_model import Ridge

ROOT        = Path(__file__).resolve().parent.parent
PANEL_PATH  = ROOT / "data/processed/panel/marz_year_panel_common_with_stress.csv"
RESULTS_DIR = ROOT / "data/processed/results"
OUT_CSV     = RESULTS_DIR / "forecast_validation_2022.csv"
RESULTS_DIR.mkdir(parents=True, exist_ok=True)

TRAIN_END = 2021
TEST_YEAR = 2022
TARGETS   = ["poverty_rate", "stress_index"]


def load_panel() -> pd.DataFrame:
    df = pd.read_csv(PANEL_PATH)
    df = df.sort_values(["marz", "year"]).reset_index(drop=True)
    fill_cols = ["poverty_rate", "stress_index", "population"]
    for col in fill_cols:
        if col in df.columns:
            df[col] = df.groupby("marz")[col].transform(lambda s: s.ffill().bfill())
    print(f"Loaded panel: {df.shape[0]} rows, {df['marz'].nunique()} regions, "
          f"years {df['year'].min()}–{df['year'].max()}")
    return df


def make_result(actual: float, predicted: float, is_poverty: bool = True) -> dict:
    """Clamp, then compute error metrics."""
    if is_poverty:
        predicted = max(0.0, min(100.0, predicted))
    signed   = predicted - actual
    absolute = abs(signed)
    pct      = (absolute / actual * 100) if actual != 0 else float("nan")
    return {
        "actual_2022":    actual,
        "predicted_2022": predicted,
        "signed_error":   signed,
        "absolute_error": absolute,
        "percent_error":  pct,
    }


# ── Model 1: Lag-1 Baseline ────────────────────────────────────────────────────

def lag1_validate(grp: pd.DataFrame, target: str) -> dict | None:
    train = grp[grp["year"] == TRAIN_END]
    test  = grp[grp["year"] == TEST_YEAR]
    if train.empty or test.empty:
        return None
    actual    = float(test[target].iloc[0])
    predicted = float(train[target].iloc[0])
    return make_result(actual, predicted, is_poverty=(target == "poverty_rate"))


# ── Model 2: Ridge Autoregressive ─────────────────────────────────────────────

def ridge_validate(grp: pd.DataFrame, target: str) -> dict | None:
    grp  = grp.sort_values("year").reset_index(drop=True)
    train = grp[grp["year"] <= TRAIN_END]
    test  = grp[grp["year"] == TEST_YEAR]
    if test.empty or len(train) < 3:
        return None

    pov  = train["poverty_rate"].values.astype(float)
    strs = train["stress_index"].values.astype(float)

    X_rows, y_rows = [], []
    for t in range(2, len(pov)):
        X_rows.append([pov[t-1], pov[t-2], strs[t-1], strs[t-2]])
        y_rows.append(float(train[target].iloc[t]))

    if len(X_rows) < 2:
        return None

    model = Ridge(alpha=1.0).fit(np.array(X_rows), y_rows)
    x_pred = [[pov[-1], pov[-2], strs[-1], strs[-2]]]
    predicted = float(model.predict(x_pred)[0])
    actual    = float(test[target].iloc[0])
    return make_result(actual, predicted, is_poverty=(target == "poverty_rate"))


# ── Model 3: Ensemble (50/50 Lag-1 + Ridge) ───────────────────────────────────

def ensemble_validate(r_lag1: dict | None, r_ridge: dict | None,
                      is_poverty: bool = True) -> dict | None:
    if r_lag1 is None and r_ridge is None:
        return None
    if r_lag1 is None:
        return r_ridge
    if r_ridge is None:
        return r_lag1
    actual    = r_lag1["actual_2022"]
    predicted = 0.5 * r_lag1["predicted_2022"] + 0.5 * r_ridge["predicted_2022"]
    return make_result(actual, predicted, is_poverty=is_poverty)


# ── National aggregate (population-weighted) ───────────────────────────────────

def national_row(df: pd.DataFrame, marz_rows: list[dict],
                 model_name: str, target: str) -> dict | None:
    target_rows = [r for r in marz_rows
                   if r["target"] == target and r["model"] == model_name
                   and r["marz"] != "Armenia"]
    if not target_rows:
        return None

    pop_df = df[df["year"] == TRAIN_END].drop_duplicates("marz").set_index("marz")
    marzes = [r["marz"] for r in target_rows]
    w = np.array([pop_df.loc[m, "population"] if m in pop_df.index else 1.0
                  for m in marzes], dtype=float)
    w /= w.sum()

    actual    = float(np.average([r["actual_2022"]    for r in target_rows], weights=w))
    predicted = float(np.average([r["predicted_2022"] for r in target_rows], weights=w))
    is_pov    = target == "poverty_rate"
    result    = make_result(actual, predicted, is_poverty=is_pov)
    return {"marz": "Armenia", "target": target, "model": model_name, **result}


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    df = load_panel()
    marzes = sorted(m for m in df["marz"].unique() if m != "Armenia (national)")

    rows: list[dict] = []
    for marz in marzes:
        grp = df[df["marz"] == marz].sort_values("year").reset_index(drop=True)
        for target in TARGETS:
            is_pov = target == "poverty_rate"
            r_l1    = lag1_validate(grp, target)
            r_ridge = ridge_validate(grp, target)
            r_ens   = ensemble_validate(r_l1, r_ridge, is_poverty=is_pov)

            for model_name, result in [
                ("Lag-1 Baseline",  r_l1),
                ("Ridge AR",        r_ridge),
                ("Ensemble",        r_ens),
            ]:
                if result is not None:
                    rows.append({"marz": marz, "target": target,
                                 "model": model_name, **result})

    # National aggregate
    nat_rows: list[dict] = []
    for model_name in ["Lag-1 Baseline", "Ridge AR", "Ensemble"]:
        for target in TARGETS:
            nr = national_row(df, rows, model_name, target)
            if nr:
                nat_rows.append(nr)
    rows.extend(nat_rows)

    out = pd.DataFrame(rows, columns=[
        "marz", "target", "actual_2022", "predicted_2022",
        "signed_error", "absolute_error", "percent_error", "model",
    ])
    out.to_csv(OUT_CSV, index=False, float_format="%.4f")
    print(f"\nSaved: {OUT_CSV}  ({len(out)} rows)")

    # Print summary table
    pov = out[(out["target"] == "poverty_rate") & (out["marz"] != "Armenia")]
    print("\n── Mean absolute error by model (poverty_rate, 11 marzes) ──")
    for model in ["Lag-1 Baseline", "Ridge AR", "Ensemble"]:
        mae = pov[pov["model"] == model]["absolute_error"].mean()
        print(f"  {model:20s}: {mae:.2f} pp MAE")

    print("\n── Per-region comparison (poverty_rate, abs error) ──")
    header = f"{'Region':20s} {'Actual':>7} {'Lag-1':>7} {'Ridge':>7} {'Ensem':>7}"
    print(header)
    print("-" * len(header))
    for marz in marzes:
        m_rows = pov[pov["marz"] == marz]
        actual = m_rows["actual_2022"].iloc[0] if not m_rows.empty else float("nan")

        def get_err(model):
            r = m_rows[m_rows["model"] == model]
            return r["absolute_error"].iloc[0] if not r.empty else float("nan")

        print(f"  {marz:20s} {actual:7.1f} {get_err('Lag-1 Baseline'):7.2f}"
              f" {get_err('Ridge AR'):7.2f} {get_err('Ensemble'):7.2f}")

    nat = out[(out["target"] == "poverty_rate") & (out["marz"] == "Armenia")]
    print("\n── National (pop-weighted) poverty error ──")
    for _, row in nat.iterrows():
        print(f"  {row['model']:20s}: actual={row['actual_2022']:.2f}%"
              f" pred={row['predicted_2022']:.2f}% err={row['absolute_error']:.2f}pp")


if __name__ == "__main__":
    main()
