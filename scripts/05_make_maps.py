# scripts/05_make_maps.py
from __future__ import annotations

from pathlib import Path
import pandas as pd
import geopandas as gpd
import matplotlib.pyplot as plt
import re


PROJECT_ROOT = Path(__file__).resolve().parent.parent

GEOJSON_PATH = PROJECT_ROOT / "data" / "raw" / "geo" / "geoBoundaries-ARM-ADM1_simplified.geojson"
DATA_PATH = PROJECT_ROOT / "data" / "processed" / "panel" / "marz_year_panel_common_with_stress.csv"

OUT_DIR = PROJECT_ROOT / "data" / "processed" / "maps"
OUT_DIR.mkdir(parents=True, exist_ok=True)


# Canonical spellings across all sources
CANON = {
    "Gegarkunik": "Gegharkunik",
    "Gegharkunik": "Gegharkunik",
    "Yerevan city": "Yerevan",
    "City Yerevan": "Yerevan",
}


def norm_marz_name(x: str) -> str:
    s = str(x).strip()
    s = re.sub(r"\s+", " ", s).strip()
    s = CANON.get(s, s)

    s_lower = s.lower()
    s_lower = s_lower.replace(" marz", "")
    s_lower = s_lower.replace(" city", "")
    s_lower = s_lower.replace("city ", "")
    s_lower = s_lower.strip()

    s_norm = " ".join(w.capitalize() for w in s_lower.split())
    if s_norm.lower() == "yerevan":
        return "Yerevan"
    return s_norm


def find_name_column(gdf: gpd.GeoDataFrame) -> str:
    # geoBoundaries uses shapeName for ADM1
    if "shapeName" in gdf.columns:
        return "shapeName"
    # fallback candidates
    for c in ["NAME_1", "name_1", "ADM1_NAME", "name", "NAME"]:
        if c in gdf.columns:
            return c
    raise RuntimeError(f"Cannot find marz name property in GeoJSON. Columns: {list(gdf.columns)}")


def save_choropleth(
    gdf: gpd.GeoDataFrame,
    col: str,
    title: str,
    out_path: Path,
) -> None:
    fig, ax = plt.subplots(figsize=(8.5, 8.5))

    # Grey for missing regions
    missing_kwds = {"color": "#D9D9D9", "label": "Missing"}

    gdf.plot(
        column=col,
        ax=ax,
        legend=True,
        missing_kwds=missing_kwds,
        edgecolor="white",
        linewidth=0.7,
    )

    ax.set_title(title)
    ax.set_axis_off()

    # Add small footnote
    fig.text(0.01, 0.01, "Source: ArmStat (PxWeb) + geoBoundaries ADM1", fontsize=8)

    plt.tight_layout()
    fig.savefig(out_path, dpi=240)
    plt.close(fig)
    print(f"[OK] saved map -> {out_path}")


def main() -> None:
    print(">>> STARTING 05_make_maps.py")
    print(f">>> GeoJSON: {GEOJSON_PATH}")
    print(f">>> Data:    {DATA_PATH}")

    if not GEOJSON_PATH.exists():
        raise FileNotFoundError(f"GeoJSON not found: {GEOJSON_PATH}")
    if not DATA_PATH.exists():
        raise FileNotFoundError(f"Dataset not found: {DATA_PATH}")

    # Load boundaries
    gdf = gpd.read_file(GEOJSON_PATH)
    name_col = find_name_column(gdf)
    gdf["marz"] = gdf[name_col].apply(norm_marz_name)

    # Load stats
    df = pd.read_csv(DATA_PATH)
    df["marz"] = df["marz"].apply(norm_marz_name)
    df["year"] = pd.to_numeric(df["year"], errors="coerce").astype("Int64")

    # Indicators to map (you can add more later)
    indicators = [
        ("poverty_rate", "Poverty rate (%)"),
        ("crime_rate_per_100k", "Crime rate per 100k"),
        ("hospitals_per_100k", "Hospitals per 100k"),
        ("beds_per_10k", "Beds per 10k"),
        ("stress_index", "Stress Index (z-score composite)"),
    ]

    # Single-year (latest in the dataset)
    year_latest = int(df["year"].max())
    df_year = df[df["year"] == year_latest].copy()

    merged_year = gdf.merge(df_year, on="marz", how="left")

    # Debug: show missing regions for stress_index (should be none now)
    if "stress_index" in merged_year.columns:
        missing = merged_year.loc[merged_year["stress_index"].isna(), "marz"].tolist()
        if missing:
            print("[WARN] Missing stress_index for these marzes on the map:", missing)

    for col, label in indicators:
        if col not in merged_year.columns:
            print(f"[WARN] column missing, skipping: {col}")
            continue
        out = OUT_DIR / f"{col}_{year_latest}.png"
        save_choropleth(
            merged_year,
            col=col,
            title=f"Armenia Marzes — {label} ({year_latest})",
            out_path=out,
        )

    # Average across all years in this dataset (2016–2022)
    cols_present = [c for c, _ in indicators if c in df.columns]
    df_avg = df.groupby("marz", as_index=False)[cols_present].mean(numeric_only=True)
    merged_avg = gdf.merge(df_avg, on="marz", how="left")

    for col, label in indicators:
        if col not in merged_avg.columns:
            print(f"[WARN] column missing, skipping: {col}")
            continue
        out = OUT_DIR / f"{col}_avg_2016_2022.png"
        save_choropleth(
            merged_avg,
            col=col,
            title=f"Armenia Marzes — Average {label} (2016–2022)",
            out_path=out,
        )

    print("\n>>> DONE. Maps saved to:")
    print(OUT_DIR)


if __name__ == "__main__":
    main()
