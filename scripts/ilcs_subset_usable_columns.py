#!/usr/bin/env python3
"""
Subset ml_households.csv to columns with 0-25% missing (usable set for ML/t-SNE/clustering).
Reads: data/ilcs/ml_households.csv
Writes: data/ilcs/ml_households_usable.csv  (same rows, only usable columns)

Run from project root: python scripts/ilcs_subset_usable_columns.py
"""

from __future__ import annotations

from pathlib import Path

import pandas as pd

THIS_FILE = Path(__file__).resolve()
PROJECT_ROOT = THIS_FILE.parent.parent
ML_CSV = PROJECT_ROOT / "data" / "ilcs" / "ml_households.csv"
OUT_CSV = PROJECT_ROOT / "data" / "ilcs" / "ml_households_usable.csv"

MAX_MISSING_PCT = 25.0


def main() -> None:
    if not ML_CSV.exists():
        raise SystemExit(f"Not found: {ML_CSV}. Run ilcs_build_ml_dataset.py and ilcs_rename_ml_columns.py first.")

    df = pd.read_csv(ML_CSV, low_memory=False)
    n = len(df)
    missing_pct = (df.isna().sum() / n * 100)
    usable_cols = missing_pct[missing_pct <= MAX_MISSING_PCT].index.tolist()
    df_usable = df[usable_cols].copy()

    OUT_CSV.parent.mkdir(parents=True, exist_ok=True)
    df_usable.to_csv(OUT_CSV, index=False)
    print(f"Wrote {OUT_CSV}: {df_usable.shape[0]:,} rows, {len(usable_cols)} columns (0-{MAX_MISSING_PCT}% missing).")


if __name__ == "__main__":
    main()
