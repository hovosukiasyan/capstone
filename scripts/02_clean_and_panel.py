# scripts/02_clean_and_panel.py
from __future__ import annotations

import re
from pathlib import Path
import pandas as pd

PROJECT_ROOT = Path(__file__).resolve().parent.parent

RAW_PX = PROJECT_ROOT / "data" / "raw" / "pxweb"
RAW_POP = PROJECT_ROOT / "data" / "raw" / "population" / "population_by_marz_year.xlsx"

TIDY_DIR = PROJECT_ROOT / "data" / "processed" / "tidy"
PANEL_DIR = PROJECT_ROOT / "data" / "processed" / "panel"
TIDY_DIR.mkdir(parents=True, exist_ok=True)
PANEL_DIR.mkdir(parents=True, exist_ok=True)


# ----------------------------
# Helpers
# ----------------------------
def norm_marz_name(x: str) -> str:
    """
    Normalize marz names across all datasets so joins work.
    Handles: 'Yerevan city', 'City Yerevan', 'Aragatsotn Marz', etc.
    """
    s = str(x).strip()
    if not s or s.lower() == "nan":
        return s

    s = re.sub(r"\s+", " ", s).strip()

    # Remove suffixes / words in a case-insensitive way
    s_lower = s.lower()
    s_lower = s_lower.replace(" marz", "")
    s_lower = s_lower.replace(" city", "")
    s_lower = s_lower.replace("city ", "")  # "City Yerevan" -> "Yerevan"
    s_lower = s_lower.strip()

    # Title-case after cleanup, but preserve "Vayots Dzor"
    s_norm = " ".join([w.capitalize() for w in s_lower.split()])

    # Special mapping
    if s_norm.lower() == "yerevan":
        return "Yerevan"
    return s_norm


def detect_year_columns(df: pd.DataFrame, first_col: str) -> list[int]:
    years = []
    for c in df.columns:
        if c == first_col:
            continue
        try:
            y = int(str(c).strip())
            years.append(y)
        except Exception:
            pass
    return years


def parse_block_table_wide(df: pd.DataFrame, *, dataset_name: str) -> pd.DataFrame:
    """
    Parses your "block tables" format:
      - First column: either indicator/type (block header) or marz names
      - Year columns: numeric years as column headers
      - Block header row: has text in first col AND all year columns are NaN/empty
      - Following rows: marz rows with year values, until next block header

    Returns tidy:
      category | marz | year | value
    """
    df = df.copy()
    first_col = df.columns[0]
    years = detect_year_columns(df, first_col)
    if not years:
        raise RuntimeError(f"[{dataset_name}] Could not detect year columns from headers.")

    year_cols = [str(y) for y in years if str(y) in df.columns]
    if not year_cols:
        # sometimes headers are int columns, not strings
        year_cols = []
        for y in years:
            if y in df.columns:
                year_cols.append(y)

    # Helper: check if a row is a "block header"
    def is_block_header(row) -> bool:
        label = row[first_col]
        if pd.isna(label):
            return False
        # if all year values are empty/NaN -> header
        vals = [row[c] for c in year_cols]
        return all(pd.isna(v) or str(v).strip() == "" for v in vals)

    current_category = None
    records = []

    for _, row in df.iterrows():
        label = row[first_col]

        if is_block_header(row):
            current_category = str(label).strip()
            continue

        # data row
        if current_category is None:
            # Sometimes first block header may be missing; skip until we get category
            continue

        marz = norm_marz_name(label)
        # skip Armenia totals/national average if present
        if marz.lower() in ["republic of armenia", "armenia", "national average", "total population", "total"]:
            continue

        for ycol in year_cols:
            try:
                year = int(str(ycol))
            except Exception:
                continue
            val = row[ycol]
            records.append(
                {
                    "category": current_category,
                    "marz": marz,
                    "year": year,
                    "value": val,
                }
            )

    tidy = pd.DataFrame(records)
    tidy["year"] = pd.to_numeric(tidy["year"], errors="coerce").astype("Int64")
    tidy["value"] = pd.to_numeric(tidy["value"], errors="coerce")
    tidy = tidy.dropna(subset=["marz", "year"])
    return tidy


# ----------------------------
# Poverty
# ----------------------------
def clean_poverty() -> pd.DataFrame:
    path = RAW_PX / "poverty_ps_hh_11.csv"
    df = pd.read_csv(path)

    first_col = df.columns[0]
    df = df.rename(columns={first_col: "row_key"})

    df["year"] = pd.to_numeric(df["row_key"], errors="coerce")
    df["year"] = df["year"].ffill()

    is_year_row = pd.to_numeric(df["row_key"], errors="coerce").notna()
    df = df[~is_year_row].copy()

    df = df.rename(columns={"row_key": "marz"})
    df["marz"] = df["marz"].apply(norm_marz_name)

    # Drop national average
    df = df[df["marz"].str.lower() != "national average"]

    rename_map = {
        "Poor population": "poverty_rate",
        "Extremely poor population": "extreme_poverty_rate",
        "Non-poor population": "non_poor_rate",
    }
    df = df.rename(columns={k: v for k, v in rename_map.items() if k in df.columns})

    keep = ["marz", "year", "poverty_rate", "extreme_poverty_rate", "non_poor_rate"]
    df = df[keep]

    for c in ["poverty_rate", "extreme_poverty_rate", "non_poor_rate"]:
        df[c] = pd.to_numeric(df[c], errors="coerce")

    out = TIDY_DIR / "poverty_tidy.csv"
    df.to_csv(out, index=False)
    print(f"[poverty] saved -> {out}  shape={df.shape}")
    return df


# ----------------------------
# Population
# ----------------------------
def load_population() -> pd.DataFrame:
    pop_raw = pd.read_excel(RAW_POP, header=None)

    # Find header row with years
    header_row_idx = None
    for i in range(min(20, len(pop_raw))):
        year_like = 0
        for cell in pop_raw.iloc[i].tolist():
            try:
                v = int(float(cell))
                if 1900 < v < 2100:
                    year_like += 1
            except Exception:
                continue
        if year_like >= 5:
            header_row_idx = i
            break

    if header_row_idx is None:
        raise RuntimeError("Could not find a header row with years in the population file.")

    header_row = pop_raw.iloc[header_row_idx].tolist()

    # Build mapping: column_index -> year
    year_cols = {}
    for col_idx, cell in enumerate(header_row):
        try:
            y = int(float(cell))
            if 1900 < y < 2100:
                year_cols[col_idx] = y
        except Exception:
            continue

    if not year_cols:
        raise RuntimeError("Found header row but no year columns were detected.")

    data = pop_raw.iloc[header_row_idx + 1 :].copy()
    data = data.rename(columns={0: "marz_raw"})
    data["marz_raw"] = data["marz_raw"].astype(str).str.strip()

    def keep_row(name: str) -> bool:
        if not name or name.lower() == "nan":
            return False
        n = name.lower()
        if "republic of armenia" in n:
            return False
        if "total" in n:
            return False
        return ("marz" in n) or ("yerevan" in n)

    data = data[data["marz_raw"].apply(keep_row)].copy()

    records = []
    for _, row in data.iterrows():
        marz = norm_marz_name(row["marz_raw"])
        for col_idx, year in year_cols.items():
            val = row.get(col_idx)
            try:
                pop_val = float(val)
            except Exception:
                pop_val = None
            records.append({"marz": marz, "year": year, "population": pop_val})

    tidy = pd.DataFrame(records)
    tidy["year"] = pd.to_numeric(tidy["year"], errors="coerce").astype("Int64")
    tidy["population"] = pd.to_numeric(tidy["population"], errors="coerce")
    tidy = tidy.dropna(subset=["population"])

    out = TIDY_DIR / "population_tidy.csv"
    tidy.to_csv(out, index=False)
    print(f"[population] saved -> {out}  shape={tidy.shape}")
    return tidy


# ----------------------------
# Crime selected types (oc03)
# ----------------------------
def clean_crime_selected() -> pd.DataFrame:
    df = pd.read_csv(RAW_PX / "crime_selected_ps_ls_oc03.csv")
    df.columns = [c.strip() for c in df.columns]

    tidy = parse_block_table_wide(df, dataset_name="crime_selected")
    tidy["category"] = tidy["category"].str.strip()

    # Save tidy long
    out = TIDY_DIR / "crime_selected_tidy_long.csv"
    tidy.to_csv(out, index=False)
    print(f"[crime_selected] saved long -> {out}  shape={tidy.shape}")

    # Also create totals per marz-year (sum across types)
    total = (
        tidy.groupby(["marz", "year"], as_index=False)["value"]
        .sum()
        .rename(columns={"value": "crime_selected_total"})
    )

    out2 = TIDY_DIR / "crime_selected_total.csv"
    total.to_csv(out2, index=False)
    print(f"[crime_selected] saved total -> {out2}  shape={total.shape}")
    return total


# ----------------------------
# Crime severity totals (oc02)
# ----------------------------
def clean_crime_severity() -> pd.DataFrame:
    df = pd.read_csv(RAW_PX / "crime_severity_ps_ls_oc02.csv")
    df.columns = [c.strip() for c in df.columns]

    tidy = parse_block_table_wide(df, dataset_name="crime_severity")
    tidy["category"] = tidy["category"].str.strip()

    out = TIDY_DIR / "crime_severity_tidy_long.csv"
    tidy.to_csv(out, index=False)
    print(f"[crime_severity] saved long -> {out}  shape={tidy.shape}")

    # Pivot: category -> columns
    wide = tidy.pivot_table(
        index=["marz", "year"], columns="category", values="value", aggfunc="first"
    ).reset_index()

    # Rename a common "total" column if present
    for c in wide.columns:
        if isinstance(c, str) and "total" in c.lower():
            wide = wide.rename(columns={c: "crime_total"})

    out2 = TIDY_DIR / "crime_severity_wide.csv"
    wide.to_csv(out2, index=False)
    print(f"[crime_severity] saved wide -> {out2}  shape={wide.shape}")
    return wide


# ----------------------------
# Health capacity (hms33)
# ----------------------------
def clean_health() -> pd.DataFrame:
    df = pd.read_csv(RAW_PX / "health_capacity_ps_si_hms33.csv")
    df.columns = [c.strip() for c in df.columns]

    tidy = parse_block_table_wide(df, dataset_name="health")
    tidy["category"] = tidy["category"].str.strip()

    out = TIDY_DIR / "health_tidy_long.csv"
    tidy.to_csv(out, index=False)
    print(f"[health] saved long -> {out}  shape={tidy.shape}")

    wide = tidy.pivot_table(
        index=["marz", "year"], columns="category", values="value", aggfunc="first"
    ).reset_index()

    # Optional renames for nicer column names
    rename = {}
    for c in wide.columns:
        if not isinstance(c, str):
            continue
        lc = c.lower()
        if lc == "number of hospitals":
            rename[c] = "hospitals"
        # If your table contains these, we map them too:
        if "doctors" in lc:
            rename[c] = "doctors"
        if "hospital beds" in lc or "beds" == lc:
            rename[c] = "beds"
        if "hospitalizations" in lc:
            rename[c] = "hospitalizations"

    wide = wide.rename(columns=rename)

    out2 = TIDY_DIR / "health_wide.csv"
    wide.to_csv(out2, index=False)
    print(f"[health] saved wide -> {out2}  shape={wide.shape}")
    return wide


# ----------------------------
# Panel + normalization
# ----------------------------
def build_panel(poverty: pd.DataFrame, population: pd.DataFrame,
                crime_sel_total: pd.DataFrame, crime_sev_wide: pd.DataFrame,
                health_wide: pd.DataFrame) -> pd.DataFrame:

    panel = poverty.copy()
    panel["year"] = pd.to_numeric(panel["year"], errors="coerce").astype("Int64")
    panel["marz"] = panel["marz"].apply(norm_marz_name)

    population = population.copy()
    population["marz"] = population["marz"].apply(norm_marz_name)

    panel = panel.merge(population, on=["marz", "year"], how="left")
    panel = panel.merge(crime_sel_total, on=["marz", "year"], how="left")
    panel = panel.merge(crime_sev_wide, on=["marz", "year"], how="left")
    panel = panel.merge(health_wide, on=["marz", "year"], how="left")

    # --- Normalized rates
    if "population" in panel.columns:
        if "crime_total" in panel.columns:
            panel["crime_rate_per_100k"] = (panel["crime_total"] / panel["population"]) * 100_000
        if "crime_selected_total" in panel.columns:
            panel["crime_selected_rate_per_100k"] = (panel["crime_selected_total"] / panel["population"]) * 100_000

        # Health per capita (only if those columns exist)
        if "hospitals" in panel.columns:
            panel["hospitals_per_100k"] = (panel["hospitals"] / panel["population"]) * 100_000
        if "doctors" in panel.columns:
            panel["doctors_per_10k"] = (panel["doctors"] / panel["population"]) * 10_000
        if "beds" in panel.columns:
            panel["beds_per_10k"] = (panel["beds"] / panel["population"]) * 10_000

    return panel


def main():
    poverty = clean_poverty()
    population = load_population()

    crime_selected_total = clean_crime_selected()
    crime_severity_wide = clean_crime_severity()
    health_wide = clean_health()

    panel = build_panel(
        poverty=poverty,
        population=population,
        crime_sel_total=crime_selected_total,
        crime_sev_wide=crime_severity_wide,
        health_wide=health_wide,
    )

    # Save full panel (may have many NaNs due to different year coverage)
    out_full = PANEL_DIR / "marz_year_panel_full.csv"
    panel.to_csv(out_full, index=False)
    print(f"\n[panel] saved full -> {out_full}  shape={panel.shape}")

    # Save common-year panel (intersection where key fields exist)
    # You can tune required columns.
    required = ["population", "poverty_rate", "crime_total", "hospitals"]
    common = panel.dropna(subset=[c for c in required if c in panel.columns]).copy()

    out_common = PANEL_DIR / "marz_year_panel_common.csv"
    common.to_csv(out_common, index=False)
    print(f"[panel] saved common -> {out_common}  shape={common.shape}")

    # Also: print year coverage summary
    print("\nYear coverage (full panel):", sorted(panel["year"].dropna().unique().tolist()))
    print("Year coverage (common panel):", sorted(common["year"].dropna().unique().tolist()))

    print("\nNext step after this:")
    print("1) EDA on marz_year_panel_common.csv")
    print("2) Missing data decisions + imputation (if needed)")
    print("3) Build Stress Index (z-scores) + modeling")


if __name__ == "__main__":
    main()
