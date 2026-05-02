#!/usr/bin/env python3
"""
Rolling Validation — Train Through T, Test T+1
================================================
For each test year in [2020, 2021, 2022]:
  - Lag-1 Baseline : predict(test_year) = actual(test_year - 1)
  - Ridge AR       : train on all years ≤ test_year-1, forecast test_year

This shows how model quality evolves as more historical data becomes available.

Output
------
  data/processed/results/forecast_rolling_validation.csv
    Columns: marz, target, train_end, test_year,
             actual, predicted, signed_error, absolute_error, percent_error, model
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
OUT_CSV     = RESULTS_DIR / "forecast_rolling_validation.csv"
RESULTS_DIR.mkdir(parents=True, exist_ok=True)

TEST_YEARS = [2020, 2021, 2022]
TARGETS    = ["poverty_rate", "stress_index"]


def load_panel() -> pd.DataFrame:
    df = pd.read_csv(PANEL_PATH)
    df = df.sort_values(["marz", "year"]).reset_index(drop=True)
    fill_cols = ["poverty_rate", "stress_index", "population"]
    for col in fill_cols:
        if col in df.columns:
            df[col] = df.groupby("marz")[col].transform(lambda s: s.ffill().bfill())
    return df


def make_result(actual: float, predicted: float, is_poverty: bool = True) -> dict:
    if is_poverty:
        predicted = max(0.0, min(100.0, predicted))
    signed   = predicted - actual
    absolute = abs(signed)
    pct      = (absolute / actual * 100) if actual != 0 else float("nan")
    return {
        "actual":         actual,
        "predicted":      predicted,
        "signed_error":   signed,
        "absolute_error": absolute,
        "percent_error":  pct,
    }


def lag1_predict(grp: pd.DataFrame, target: str, test_year: int) -> dict | None:
    lag_row  = grp[grp["year"] == test_year - 1]
    test_row = grp[grp["year"] == test_year]
    if lag_row.empty or test_row.empty:
        return None
    actual    = float(test_row[target].iloc[0])
    predicted = float(lag_row[target].iloc[0])
    return make_result(actual, predicted, is_poverty=(target == "poverty_rate"))


def ridge_predict(grp: pd.DataFrame, target: str, test_year: int) -> dict | None:
    train_end = test_year - 1
    train = grp[grp["year"] <= train_end].sort_values("year")
    test  = grp[grp["year"] == test_year]
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


def national_row(df: pd.DataFrame, marz_rows: list[dict],
                 model_name: str, target: str, test_year: int) -> dict | None:
    subset = [r for r in marz_rows
              if r["target"] == target and r["model"] == model_name
              and r["test_year"] == test_year and r["marz"] != "Armenia"]
    if not subset:
        return None

    train_end = test_year - 1
    pop_df = df[df["year"] == train_end].drop_duplicates("marz").set_index("marz")
    marzes = [r["marz"] for r in subset]
    w = np.array([pop_df.loc[m, "population"] if m in pop_df.index else 1.0
                  for m in marzes], dtype=float)
    w /= w.sum()

    actual    = float(np.average([r["actual"]    for r in subset], weights=w))
    predicted = float(np.average([r["predicted"] for r in subset], weights=w))
    is_pov    = target == "poverty_rate"
    result    = make_result(actual, predicted, is_poverty=is_pov)
    return {
        "marz":      "Armenia",
        "target":    target,
        "train_end": train_end,
        "test_year": test_year,
        "model":     model_name,
        **result,
    }


def main() -> None:
    df = load_panel()
    marzes = sorted(m for m in df["marz"].unique() if m != "Armenia (national)")

    rows: list[dict] = []
    for test_year in TEST_YEARS:
        train_end = test_year - 1
        for marz in marzes:
            grp = df[df["marz"] == marz].sort_values("year").reset_index(drop=True)
            for target in TARGETS:
                for model_name, fn in [("Lag-1 Baseline", lag1_predict),
                                        ("Ridge AR",        ridge_predict)]:
                    result = fn(grp, target, test_year)
                    if result is not None:
                        rows.append({
                            "marz":      marz,
                            "target":    target,
                            "train_end": train_end,
                            "test_year": test_year,
                            "model":     model_name,
                            **result,
                        })

    nat_rows: list[dict] = []
    for test_year in TEST_YEARS:
        for model_name in ["Lag-1 Baseline", "Ridge AR"]:
            for target in TARGETS:
                nr = national_row(df, rows, model_name, target, test_year)
                if nr:
                    nat_rows.append(nr)
    rows.extend(nat_rows)

    out = pd.DataFrame(rows, columns=[
        "marz", "target", "train_end", "test_year",
        "actual", "predicted", "signed_error", "absolute_error", "percent_error", "model",
    ])
    out.to_csv(OUT_CSV, index=False, float_format="%.4f")
    print(f"Saved: {OUT_CSV}  ({len(out)} rows)")

    # Summary: mean absolute error per (model, test_year) for poverty_rate, 11 marzes
    pov = out[(out["target"] == "poverty_rate") & (out["marz"] != "Armenia")]
    print("\n── Mean Absolute Error by model and test year (poverty_rate, 11 marzes) ──")
    pivot = pov.pivot_table(index="model", columns="test_year",
                            values="absolute_error", aggfunc="mean")
    print(pivot.round(2).to_string())


if __name__ == "__main__":
    main()
