#!/usr/bin/env python3
"""
Build an ML-ready household-level dataset from ILCS 2015 by joining:
  hh (housing) + weight + member aggregates (from mem) + income aggregates (y1, h2)
  + optional consumption aggregates (x1, x2, x4, z3).

Reads from CSV files or from PostgreSQL ilcs schema (if --postgres).
Writes to data/ilcs/ml_households.csv and optionally to ilcs.ml_households in Postgres.

Usage (from project root):
  python scripts/ilcs_build_ml_dataset.py                    # read/write CSV only
  python scripts/ilcs_build_ml_dataset.py --postgres          # read from Postgres, write CSV + Postgres
  python scripts/ilcs_build_ml_dataset.py --postgres --csv-only  # read Postgres, write CSV only
"""

from __future__ import annotations

import argparse
import os
from pathlib import Path

import pandas as pd

try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parent.parent / ".env")
except ImportError:
    pass

# -----------------------------------------------------------------------------
# Paths
# -----------------------------------------------------------------------------
THIS_FILE = Path(__file__).resolve()
PROJECT_ROOT = THIS_FILE.parent.parent
ILCS_CSV_DIR = PROJECT_ROOT / "data" / "ilcs" / "ARM_2015_ILCS_v02_M_CSV"
OUT_CSV = PROJECT_ROOT / "data" / "ilcs" / "ml_households.csv"


def load_from_csv() -> dict[str, pd.DataFrame]:
    """Load hh, weight, mem, y1, h2 and optionally x1,x2,x4,z3 from CSV."""
    data = {}
    for name in ["hh", "weight", "mem", "y1", "h2"]:
        p = ILCS_CSV_DIR / f"{name}.csv"
        if p.exists():
            data[name] = pd.read_csv(p, low_memory=False)
    for name in ["x1", "x2", "x4", "z3"]:
        p = ILCS_CSV_DIR / f"{name}.csv"
        if p.exists():
            data[name] = pd.read_csv(p, low_memory=False)
    return data


def load_from_postgres() -> dict[str, pd.DataFrame]:
    """Load same tables from ilcs schema."""
    from sqlalchemy import create_engine
    from urllib.parse import quote_plus

    url = os.environ.get("DATABASE_URL")
    if not url:
        host = os.environ.get("POSTGRES_HOST", "localhost")
        port = os.environ.get("POSTGRES_PORT", "5432")
        user = os.environ.get("POSTGRES_USER", "postgres")
        password = os.environ.get("POSTGRES_PASSWORD", "")
        db = os.environ.get("POSTGRES_DB", "capstone")
        password = quote_plus(password) if password else ""
        url = f"postgresql://{user}:{password}@{host}:{port}/{db}"
    engine = create_engine(url)
    data = {}
    for name in ["hh", "weight", "mem", "y1", "h2", "x1", "x2", "x4", "z3"]:
        try:
            data[name] = pd.read_sql_table(name, engine, schema="ilcs")
        except Exception:
            pass
    return data


def build_household_aggregates(mem: pd.DataFrame) -> pd.DataFrame:
    """One row per recno: member count, mean age, share with education/employment flags if present."""
    mem = mem.copy()
    mem["recno"] = pd.to_numeric(mem["recno"], errors="coerce")
    mem["age"] = pd.to_numeric(mem["age"], errors="coerce")
    agg = mem.groupby("recno").agg(
        n_members=("memnum", "count"),
        mean_age=("age", "mean"),
    ).reset_index()
    return agg


def build_income_aggregates(y1: pd.DataFrame, h2: pd.DataFrame | None) -> pd.DataFrame:
    """One row per recno: total income (y1_3 sum), income source count. Optionally merge h2."""
    y1 = y1.copy()
    y1["recno"] = pd.to_numeric(y1["recno"], errors="coerce")
    # y1_3 / y1_3drm are typically the amount columns
    amt = "y1_3" if "y1_3" in y1.columns else "y1_3drm"
    if amt not in y1.columns:
        amt = y1.select_dtypes(include=["number"]).columns[2] if len(y1.columns) > 2 else None
    if amt:
        y1[amt] = pd.to_numeric(y1[amt], errors="coerce")
        inc = y1.groupby("recno").agg(
            income_total=(amt, "sum"),
            income_sources=(amt, "count"),
        ).reset_index()
    else:
        inc = y1.groupby("recno").size().reset_index(name="income_sources")
        inc = inc.rename(columns={inc.columns[0]: "recno"})
    if h2 is not None and not h2.empty and "recno" in h2.columns:
        h2 = h2.copy()
        h2["recno"] = pd.to_numeric(h2["recno"], errors="coerce")
        # keep one row per recno (h2 can have multiple)
        h2_1 = h2.drop_duplicates(subset=["recno"], keep="first")
        inc = inc.merge(h2_1, on="recno", how="left", suffixes=("", "_h2"))
    return inc


def build_consumption_aggregates(
    x1: pd.DataFrame | None,
    x2: pd.DataFrame | None,
    x4: pd.DataFrame | None,
    z3: pd.DataFrame | None,
) -> pd.DataFrame:
    """One row per recno: sum of costs/amounts from x1,x2,x4,z3 where applicable."""
    dfs = []
    # x1: purchased food - often has amount in column index 4 or 5
    if x1 is not None and not x1.empty:
        x1 = x1.copy()
        x1["recno"] = pd.to_numeric(x1["recno"], errors="coerce")
        num_cols = [c for c in x1.select_dtypes(include=["number"]).columns if c not in ("recno", "date", "day")]
        if num_cols:
            x1["_x1_sum"] = x1[num_cols].sum(axis=1)
            agg = x1.groupby("recno")["_x1_sum"].sum().reset_index(name="food_purchases_total")
            dfs.append(agg)
    # x4: cost of services/goods - look for amount-like column
    if x4 is not None and not x4.empty:
        x4 = x4.copy()
        x4["recno"] = pd.to_numeric(x4["recno"], errors="coerce")
        num_cols = [c for c in x4.select_dtypes(include=["number"]).columns if c not in ("recno", "date", "day")]
        if num_cols:
            x4["_x4_sum"] = x4[num_cols].sum(axis=1)
            agg = x4.groupby("recno")["_x4_sum"].sum().reset_index(name="services_goods_total")
            dfs.append(agg)
    # z3: purchased goods/services
    if z3 is not None and not z3.empty:
        z3 = z3.copy()
        z3["recno"] = pd.to_numeric(z3["recno"], errors="coerce")
        num_cols = [c for c in z3.select_dtypes(include=["number"]).columns if c != "recno"]
        if num_cols:
            z3["_z3_sum"] = z3[num_cols].sum(axis=1)
            agg = z3.groupby("recno")["_z3_sum"].sum().reset_index(name="goods_services_total")
            dfs.append(agg)
    if not dfs:
        return pd.DataFrame(columns=["recno"])
    out = dfs[0]
    for d in dfs[1:]:
        out = out.merge(d, on="recno", how="outer")
    return out


def build_ml_households(
    hh: pd.DataFrame,
    weight: pd.DataFrame,
    mem_agg: pd.DataFrame,
    income_agg: pd.DataFrame,
    consumption_agg: pd.DataFrame | None,
) -> pd.DataFrame:
    """Join all to one household-level table."""
    hh = hh.copy()
    hh["recno"] = pd.to_numeric(hh["recno"], errors="coerce")
    weight = weight.copy()
    weight["recno"] = pd.to_numeric(weight["recno"], errors="coerce")
    weight = weight[["recno", "weight"]].drop_duplicates(subset=["recno"])
    weight = weight.rename(columns={"weight": "sample_weight"})
    df = hh.merge(weight, on="recno", how="left")
    df = df.merge(mem_agg, on="recno", how="left")
    df = df.merge(income_agg, on="recno", how="left")
    if consumption_agg is not None and not consumption_agg.empty and "recno" in consumption_agg.columns:
        df = df.merge(consumption_agg, on="recno", how="left")
    return df


def main() -> None:
    ap = argparse.ArgumentParser(description="Build ML-ready ILCS household dataset")
    ap.add_argument("--postgres", action="store_true", help="Read from PostgreSQL ilcs schema")
    ap.add_argument("--csv-only", action="store_true", help="Write only CSV (do not write to Postgres)")
    args = ap.parse_args()

    if args.postgres:
        print("Loading from PostgreSQL ilcs schema...")
        data = load_from_postgres()
    else:
        print("Loading from CSV...")
        data = load_from_csv()

    if "hh" not in data or data["hh"].empty:
        raise SystemExit("Missing or empty hh table.")
    if "weight" not in data or data["weight"].empty:
        raise SystemExit("Missing or empty weight table.")

    print("Building member aggregates...")
    mem_agg = build_household_aggregates(data["mem"]) if data.get("mem") is not None and not data["mem"].empty else pd.DataFrame(columns=["recno", "n_members", "mean_age"])
    print("Building income aggregates...")
    income_agg = build_income_aggregates(data["y1"], data.get("h2"))
    print("Building consumption aggregates...")
    consumption_agg = build_consumption_aggregates(
        data.get("x1"), data.get("x2"), data.get("x4"), data.get("z3")
    )
    if consumption_agg.empty or consumption_agg.columns.tolist() == ["recno"]:
        consumption_agg = None

    print("Joining ML household table...")
    ml = build_ml_households(
        data["hh"],
        data["weight"],
        mem_agg,
        income_agg,
        consumption_agg,
    )

    OUT_CSV.parent.mkdir(parents=True, exist_ok=True)
    ml.to_csv(OUT_CSV, index=False)
    print(f"Wrote {len(ml):,} rows to {OUT_CSV}")

    if args.postgres and not args.csv_only:
        try:
            from sqlalchemy import create_engine
            from urllib.parse import quote_plus
            url = os.environ.get("DATABASE_URL")
            if not url:
                host = os.environ.get("POSTGRES_HOST", "localhost")
                port = os.environ.get("POSTGRES_PORT", "5432")
                user = os.environ.get("POSTGRES_USER", "postgres")
                password = os.environ.get("POSTGRES_PASSWORD", "")
                db = os.environ.get("POSTGRES_DB", "capstone")
                password = quote_plus(password) if password else ""
                url = f"postgresql://{user}:{password}@{host}:{port}/{db}"
            engine = create_engine(url)
            ml.to_sql("ml_households", engine, schema="ilcs", if_exists="replace", index=False)
            print("Wrote ilcs.ml_households in PostgreSQL.")
        except Exception as e:
            print(f"Could not write to Postgres: {e}")


if __name__ == "__main__":
    main()
