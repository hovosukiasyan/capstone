#!/usr/bin/env python3
"""
Export a codebook for the ML household dataset: value labels (and variable labels)
for all categorical variables that appear in ml_households.csv.
Source: DDI codebook (ARM_2015_ILCS_v02_M.xml), restricted to variables from
hh (F165) and h2 (F164) that exist in the ML table.

Writes:
  - data/ilcs/ml_households_codebook.csv  (variable, variable_label, value, value_label)
  - data/ilcs/ml_households_variable_labels.csv  (variable, variable_label) for reference

Run from project root: python scripts/ilcs_export_ml_codebook.py
"""

from __future__ import annotations

import xml.etree.ElementTree as ET
from pathlib import Path

import pandas as pd

THIS_FILE = Path(__file__).resolve()
PROJECT_ROOT = THIS_FILE.parent.parent
ILCS_XML_PATH = PROJECT_ROOT / "data" / "ilcs" / "ARM_2015_ILCS_v02_M.xml"
ML_CSV_PATH = PROJECT_ROOT / "data" / "ilcs" / "ml_households.csv"
OUT_CODEBOOK = PROJECT_ROOT / "data" / "ilcs" / "ml_households_codebook.csv"
OUT_VAR_LABELS = PROJECT_ROOT / "data" / "ilcs" / "ml_households_variable_labels.csv"

DDI_NS = "http://www.icpsr.umich.edu/DDI"

# Only hh and h2 feed into ml_households; extract codebook for these files.
ML_FILE_IDS = {"F165", "F164"}  # hh, h2


def _find_text(el: ET.Element | None, tag: str) -> str:
    if el is None:
        return ""
    child = el.find(f"{{{DDI_NS}}}{tag}")
    return (child.text or "").strip() if child is not None else ""


def parse_ml_codebook(xml_path: Path) -> tuple[list[tuple[str, str, str, str]], list[tuple[str, str]]]:
    """
    Parse DDI XML for F165 (hh) and F164 (h2).
    Returns (value_labels, variable_labels)
    value_labels: (variable_name, variable_label, value, value_label)
    variable_labels: (variable_name, variable_label)
    """
    tree = ET.parse(xml_path)
    root = tree.getroot()

    value_rows: list[tuple[str, str, str, str]] = []
    var_rows: list[tuple[str, str]] = []

    for var in root.iter(f"{{{DDI_NS}}}var"):
        if var.get("files") not in ML_FILE_IDS:
            continue
        name = (var.get("name") or "").strip()
        if not name:
            continue
        labl_el = var.find(f"{{{DDI_NS}}}labl")
        var_label = (labl_el.text or "").strip() if labl_el is not None else ""
        var_rows.append((name, var_label))
        for catgry in var.findall(f"{{{DDI_NS}}}catgry"):
            cat_val = _find_text(catgry, "catValu")
            cat_labl = _find_text(catgry, "labl")
            if cat_val:
                value_rows.append((name, var_label, cat_val, cat_labl))
    return value_rows, var_rows


def main() -> None:
    if not ILCS_XML_PATH.exists():
        raise SystemExit(f"XML not found: {ILCS_XML_PATH}")

    ml_columns = set()
    if ML_CSV_PATH.exists():
        ml_columns = set(pd.read_csv(ML_CSV_PATH, nrows=0).columns)
    else:
        print("Warning: ml_households.csv not found; outputting codebook for all hh/h2 variables.")

    value_rows, var_rows = parse_ml_codebook(ILCS_XML_PATH)

    # Filter to variables that appear in ml_households (if we have it)
    if ml_columns:
        value_rows = [(v, vl, val, vlab) for v, vl, val, vlab in value_rows if v in ml_columns]
        var_rows = [(v, vl) for v, vl in var_rows if v in ml_columns]

    OUT_CODEBOOK.parent.mkdir(parents=True, exist_ok=True)

    if value_rows:
        codebook = pd.DataFrame(
            value_rows,
            columns=["variable", "variable_label", "value", "value_label"],
        )
        codebook.to_csv(OUT_CODEBOOK, index=False)
        print(f"Wrote {len(codebook):,} value labels to {OUT_CODEBOOK}")
    else:
        print("No value labels to write (no categorical variables or no match with ML columns).")

    if var_rows:
        var_df = pd.DataFrame(var_rows, columns=["variable", "variable_label"])
        var_df = var_df.drop_duplicates(subset=["variable"], keep="first")
        var_df.to_csv(OUT_VAR_LABELS, index=False)
        print(f"Wrote {len(var_df):,} variable labels to {OUT_VAR_LABELS}")

    print("Done. Use ml_households_codebook.csv to decode categorical columns in ml_households.csv.")


if __name__ == "__main__":
    main()
