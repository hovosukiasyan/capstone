#!/usr/bin/env python3
"""
Load ILCS 2015 CSVs into PostgreSQL and ingest DDI codebook (variable/value labels).

- Creates schema `ilcs` and one table per CSV, linked by `recno` (household ID).
- Parses ARM_2015_ILCS_v02_M.xml for variable labels and value labels and stores
  them in ilcs.variable_labels and ilcs.value_labels.

Usage:
  Set DATABASE_URL (or POSTGRES_HOST, POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB),
  then run from project root:
    python scripts/ilcs_load_to_postgres.py

Requires: pandas, sqlalchemy, psycopg2-binary
"""

from __future__ import annotations

import os
import re
import xml.etree.ElementTree as ET
from pathlib import Path
from urllib.parse import quote_plus

import pandas as pd

try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parent.parent / ".env")
except ImportError:
    pass
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine
from sqlalchemy.exc import OperationalError

# -----------------------------------------------------------------------------
# Paths and config
# -----------------------------------------------------------------------------
THIS_FILE = Path(__file__).resolve()
SCRIPTS_DIR = THIS_FILE.parent
PROJECT_ROOT = SCRIPTS_DIR.parent
ILCS_CSV_DIR = PROJECT_ROOT / "data" / "ilcs" / "ARM_2015_ILCS_v02_M_CSV"
ILCS_XML_PATH = PROJECT_ROOT / "data" / "ilcs" / "ARM_2015_ILCS_v02_M.xml"

# File ID (in DDI) -> CSV filename (without .csv) and table name
# Only files we kept after dropping F1, F2, F3, L1, N1, Z2-2015
FILE_ID_TO_TABLE: dict[str, str] = {
    "F157": "mem",
    "F161": "f4",
    "F162": "g1",
    "F163": "h1",
    "F164": "h2",
    "F165": "hh",
    "F168": "weight",
    "F169": "x1",
    "F170": "x2",
    "F171": "x3",
    "F172": "x4",
    "F173": "x5",
    "F174": "y1",
    "F176": "z3",
}

DDI_NS = "http://www.icpsr.umich.edu/DDI"


def get_engine() -> Engine:
    url = os.environ.get("DATABASE_URL")
    if url:
        return create_engine(url)
    host = os.environ.get("POSTGRES_HOST", "localhost")
    port = os.environ.get("POSTGRES_PORT", "5432")
    user = os.environ.get("POSTGRES_USER", "postgres")
    password = os.environ.get("POSTGRES_PASSWORD", "")
    db = os.environ.get("POSTGRES_DB", "capstone")
    password = quote_plus(password) if password else ""
    return create_engine(
        f"postgresql://{user}:{password}@{host}:{port}/{db}"
    )


def sanitize_column_name(name: str) -> str:
    """Lowercase and allow only [a-z0-9_]; replace other chars with underscore."""
    s = name.lower().strip()
    s = re.sub(r"[^a-z0-9_]", "_", s)
    s = re.sub(r"_+", "_", s).strip("_")
    return s or "col"


def create_schema(engine: Engine) -> None:
    with engine.connect() as conn:
        conn.execute(text("CREATE SCHEMA IF NOT EXISTS ilcs"))
        conn.commit()
    print("Schema ilcs created (or already exists).")


def load_csv_table(
    engine: Engine,
    table_name: str,
    csv_path: Path,
    *,
    chunksize: int = 50_000,
) -> None:
    """Load one CSV into ilcs.<table_name>; sanitize column names."""
    if not csv_path.exists():
        print(f"  Skip {table_name}: file not found {csv_path}")
        return
    df = pd.read_csv(csv_path, low_memory=False)
    df.columns = [sanitize_column_name(c) for c in df.columns]
    # Ensure recno is int where possible (for FK clarity)
    if "recno" in df.columns:
        df["recno"] = pd.to_numeric(df["recno"], errors="coerce").astype("Int64")
    df.to_sql(
        table_name,
        engine,
        schema="ilcs",
        if_exists="replace",
        index=False,
        method="multi",
        chunksize=chunksize,
    )
    print(f"  Loaded {table_name}: {len(df):,} rows.")


def parse_ddi_codebook(xml_path: Path) -> tuple[list[tuple[str, str, str]], list[tuple[str, str, str, str]]]:
    """
    Parse DDI XML and return (variable_labels, value_labels).
    variable_labels: (file_id, variable_name, label)
    value_labels: (file_id, variable_name, value, value_label)
    Only includes file IDs we have (FILE_ID_TO_TABLE).
    """
    tree = ET.parse(xml_path)
    root = tree.getroot()

    def find_text(el: ET.Element | None, tag: str) -> str:
        if el is None:
            return ""
        child = el.find(f"{{{DDI_NS}}}{tag}")
        return (child.text or "").strip() if child is not None else ""

    var_labels: list[tuple[str, str, str]] = []
    val_labels: list[tuple[str, str, str, str]] = []

    # All <var> elements (DDI uses default ns in the file)
    for var in root.iter(f"{{{DDI_NS}}}var"):
        files_attr = var.get("files")
        if not files_attr or files_attr not in FILE_ID_TO_TABLE:
            continue
        name = (var.get("name") or "").strip()
        if not name:
            continue
        labl_el = var.find(f"{{{DDI_NS}}}labl")
        label = (labl_el.text or "").strip() if labl_el is not None else ""
        var_labels.append((files_attr, name, label))
        for catgry in var.findall(f"{{{DDI_NS}}}catgry"):
            cat_val = find_text(catgry, "catValu")
            cat_labl = find_text(catgry, "labl")
            if cat_val:
                val_labels.append((files_attr, name, cat_val, cat_labl))
    return var_labels, val_labels


def load_metadata_tables(
    engine: Engine,
    xml_path: Path,
) -> None:
    """Parse DDI and insert into ilcs.variable_labels and ilcs.value_labels."""
    var_rows, val_rows = parse_ddi_codebook(xml_path)
    with engine.connect() as conn:
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS ilcs.variable_labels (
                file_id VARCHAR(10) NOT NULL,
                table_name VARCHAR(32) NOT NULL,
                variable_name VARCHAR(128) NOT NULL,
                label TEXT
            )
        """))
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS ilcs.value_labels (
                file_id VARCHAR(10) NOT NULL,
                table_name VARCHAR(32) NOT NULL,
                variable_name VARCHAR(128) NOT NULL,
                value VARCHAR(64) NOT NULL,
                value_label TEXT
            )
        """))
        conn.commit()

    # Map file_id -> table_name for inserts
    var_df = pd.DataFrame(
        [
            (fid, FILE_ID_TO_TABLE[fid], vname, lbl)
            for fid, vname, lbl in var_rows
        ],
        columns=["file_id", "table_name", "variable_name", "label"],
    )
    val_df = pd.DataFrame(
        [
            (fid, FILE_ID_TO_TABLE[fid], vname, val, vlab)
            for fid, vname, val, vlab in val_rows
        ],
        columns=["file_id", "table_name", "variable_name", "value", "value_label"],
    )
    var_df.to_sql("variable_labels", engine, schema="ilcs", if_exists="replace", index=False)
    val_df.to_sql("value_labels", engine, schema="ilcs", if_exists="replace", index=False)
    print(f"  variable_labels: {len(var_df):,} rows.")
    print(f"  value_labels: {len(val_df):,} rows.")


def add_foreign_key_comments(engine: Engine) -> None:
    """Add comment on ilcs schema describing the link key."""
    with engine.connect() as conn:
        conn.execute(text("""
            COMMENT ON SCHEMA ilcs IS
            'ILCS 2015 survey. All tables link on recno (household ID). members also has memnum (member within household).'
        """))
        conn.commit()
    print("  Schema comment added.")


def main() -> None:
    print("ILCS 2015 → PostgreSQL loader")
    print("CSV dir:", ILCS_CSV_DIR)
    print("XML path:", ILCS_XML_PATH)
    if not ILCS_CSV_DIR.exists():
        raise SystemExit(f"CSV directory not found: {ILCS_CSV_DIR}")
    if not ILCS_XML_PATH.exists():
        raise SystemExit(f"XML file not found: {ILCS_XML_PATH}")

    engine = get_engine()
    try:
        print("\n1. Creating schema ilcs ...")
        create_schema(engine)
        print("\n2. Loading data tables ...")
        for file_id, table_name in FILE_ID_TO_TABLE.items():
            csv_path = ILCS_CSV_DIR / f"{table_name}.csv"
            load_csv_table(engine, table_name, csv_path)
        print("\n3. Parsing DDI and loading variable/value labels ...")
        load_metadata_tables(engine, ILCS_XML_PATH)
        add_foreign_key_comments(engine)
        print("\nDone. Tables in schema ilcs:")
        with engine.connect() as conn:
            r = conn.execute(text("""
                SELECT table_name FROM information_schema.tables
                WHERE table_schema = 'ilcs' ORDER BY table_name
            """))
            for row in r:
                print("  -", row[0])
    except OperationalError as e:
        if "password" in str(e).lower() or "auth" in str(e).lower():
            print("\nHint: set POSTGRES_PASSWORD or DATABASE_URL in .env (see .env.example).")
        raise


if __name__ == "__main__":
    main()
