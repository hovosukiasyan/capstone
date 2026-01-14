# scripts/03_sanity_checks.py
from __future__ import annotations

from pathlib import Path
import sys
import pandas as pd


PROJECT_ROOT = Path(__file__).resolve().parent.parent
COMMON_PATH = PROJECT_ROOT / "data" / "processed" / "panel" / "marz_year_panel_common.csv"


def die(msg: str, code: int = 1) -> None:
    print(f"\n[FAIL] {msg}")
    sys.exit(code)


def warn(msg: str) -> None:
    print(f"[WARN] {msg}")


def ok(msg: str) -> None:
    print(f"[OK] {msg}")


def main() -> None:
    print(">>> STARTING 03_sanity_checks.py")
    print(f">>> Loading: {COMMON_PATH}")

    if not COMMON_PATH.exists():
        die(f"File not found: {COMMON_PATH}")

    df = pd.read_csv(COMMON_PATH)

    ok(f"Loaded dataset shape = {df.shape}")
    print("\nColumns:")
    print(list(df.columns))

    # --- Required columns
    required = ["marz", "year", "poverty_rate", "crime_total", "hospitals", "population"]
    missing_required = [c for c in required if c not in df.columns]
    if missing_required:
        die(f"Missing required columns: {missing_required}")
    ok("Required columns present")

    # --- Types / coercions (do not modify original df on disk)
    df_chk = df.copy()

    df_chk["marz"] = df_chk["marz"].astype(str).str.strip()
    df_chk["year"] = pd.to_numeric(df_chk["year"], errors="coerce")

    for c in ["poverty_rate", "crime_total", "hospitals", "population"]:
        df_chk[c] = pd.to_numeric(df_chk[c], errors="coerce")

    # --- Year coverage check
    years = sorted(df_chk["year"].dropna().astype(int).unique().tolist())
    print("\nYear coverage:", years)

    expected_years = list(range(2016, 2023))  # 2016..2022 inclusive
    if years != expected_years:
        warn(f"Expected years {expected_years} but got {years}. (Not fatal, but check your filters.)")
    else:
        ok("Year coverage matches expected 2016–2022")

    # --- Marz sanity
    marzes = sorted(df_chk["marz"].unique().tolist())
    print("\nMarzes (unique):")
    print(marzes)
    ok(f"Unique marzes count = {len(marzes)}")

    # Detect common bad naming issues
    suspicious = [m for m in marzes if ("city" in m.lower()) or ("marz" in m.lower())]
    if suspicious:
        warn(f"Suspicious marz naming found (should be normalized): {suspicious}")
    else:
        ok("Marz naming looks normalized (no 'city'/'marz' suffixes detected)")

    # --- Duplicate key check
    dup_keys = df_chk.duplicated(subset=["marz", "year"]).sum()
    if dup_keys > 0:
        die(f"Found {dup_keys} duplicated (marz, year) rows. Panel should have unique keys.")
    ok("No duplicate (marz, year) keys")

    # --- Completeness per marz (should have same count for each marz)
    counts = df_chk.groupby("marz")["year"].nunique().sort_values()
    print("\nNumber of years per marz:")
    print(counts.to_string())

    if counts.min() != counts.max():
        warn("Not all marzes have the same number of years (some missing).")
    else:
        ok(f"All marzes have {counts.max()} years each")

    # --- Missingness summary
    print("\nMissingness (% of rows) for key columns:")
    for c in ["poverty_rate", "crime_total", "hospitals", "population"]:
        pct = df_chk[c].isna().mean() * 100
        print(f"  - {c}: {pct:.2f}%")

    # --- Basic value sanity rules
    # Poverty rate should usually be 0..100
    poverty_bad = df_chk[(df_chk["poverty_rate"] < 0) | (df_chk["poverty_rate"] > 100)]
    if len(poverty_bad) > 0:
        warn(f"Poverty rate has {len(poverty_bad)} out-of-range rows. Showing first 5:")
        print(poverty_bad[["marz", "year", "poverty_rate"]].head(5).to_string(index=False))
    else:
        ok("Poverty rate within 0..100 range")

    # Population should be positive
    pop_bad = df_chk[df_chk["population"] <= 0]
    if len(pop_bad) > 0:
        warn(f"Population has {len(pop_bad)} non-positive rows. Showing first 5:")
        print(pop_bad[["marz", "year", "population"]].head(5).to_string(index=False))
    else:
        ok("Population values are positive")

    # Crimes/hospitals should be non-negative
    for col in ["crime_total", "hospitals"]:
        bad = df_chk[df_chk[col] < 0]
        if len(bad) > 0:
            warn(f"{col} has {len(bad)} negative rows. Showing first 5:")
            print(bad[["marz", "year", col]].head(5).to_string(index=False))
        else:
            ok(f"{col} values are non-negative")

    # --- Optional: if normalized columns exist, check them too
    optional_rate_cols = ["crime_rate_per_100k", "hospitals_per_100k"]
    for col in optional_rate_cols:
        if col in df_chk.columns:
            df_chk[col] = pd.to_numeric(df_chk[col], errors="coerce")
            bad = df_chk[df_chk[col] < 0]
            if len(bad) > 0:
                warn(f"{col} has {len(bad)} negative rows. Showing first 5:")
                print(bad[["marz", "year", col]].head(5).to_string(index=False))
            else:
                ok(f"{col} values are non-negative")
        else:
            warn(f"Optional rate column not found (ok): {col}")

    print("\n>>> SANITY CHECKS COMPLETE")
    print("If you only saw [OK] (and maybe minor [WARN]), you're safe to proceed to EDA + Stress Index.")


if __name__ == "__main__":
    main()
