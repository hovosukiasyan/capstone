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


def norm_marz_name(x: str) -> str:
    s = str(x).strip()
    s = re.sub(r"\s+", " ", s).strip()
    s_lower = s.lower()
    s_lower = s_lower.replace(" marz", "")
    s_lower = s_lower.replace(" city", "")
    s_lower = s_lower.replace("city ", "")
    s_lower = s_lower.strip()
    s_norm = " ".join([w.capitalize() for w in s_lower.split()])
    if s_norm.lower() == "yerevan":
        return "Yerevan"
    return s_norm


def find_name_column(gdf: gpd.GeoDataFrame) -> str:
    """
    Try to locate the admin-1 name field inside GeoJSON properties.
    We'll try common keys first; if none, print available columns.
    """
    candidates = [
        "shapeName", "shapeNAME", "NAME_1", "name_1", "ADM1_NAME", "adm1_name",
        "name", "NAME", "shapeGroup", "shapeGroupName"
    ]
    for c in candidates:
        if c in gdf.columns:
            return c

    # If not found, fail with helpful info
    raise RuntimeError(
        "Could not find a marz-name column in GeoJSON. Available columns:\n"
        + str(list(gdf.columns))
        + "\nOpen the GeoJSON and tell me which property contains marz names."
    )


def save_choropleth(
    gdf: gpd.GeoDataFrame,
    col: str,
    title: str,
    out_path: Path,
) -> None:
    fig, ax = plt.subplots(figsize=(8, 8))
    gdf.plot(
        column=col,
        ax=ax,
        legend=True,
        missing_kwds={"color": "lightgrey", "label": "Missing"},
        edgecolor="white",
        linewidth=0.6,
    )
    ax.set_title(title)
    ax.set_axis_off()
    plt.tight_layout()
    fig.savefig(out_path, dpi=220)
    plt.close(fig)
    print(f"[OK] saved map -> {out_path}")


def main() -> None:
    print(">>> STARTING 05_make_maps.py")
    print(f">>> GeoJSON: {GEOJSON_PATH}")
    print(f">>> Data:    {DATA_PATH}")

    if not GEOJSON_PATH.exists():
        raise FileNotFoundError(f"GeoJSON not found: {GEOJSON_PATH}")
    if not DATA_PATH.exists():
        raise FileNotFoundError(
            f"Dataset not found: {DATA_PATH}\n"
            "Make sure you saved your final dataset as:\n"
            "data/processed/panel/marz_year_panel_common_with_stress.csv"
        )

    # Load geospatial boundaries
    gdf = gpd.read_file(GEOJSON_PATH)
    name_col = find_name_column(gdf)

    gdf["marz"] = gdf[name_col].apply(norm_marz_name)

    # Load stats
    df = pd.read_csv(DATA_PATH)
    df["marz"] = df["marz"].apply(norm_marz_name)
    df["year"] = pd.to_numeric(df["year"], errors="coerce").astype("Int64")

    # Indicators we want to map (you can add more later)
    indicators = [
        ("poverty_rate", "Poverty rate (%)"),
        ("crime_rate_per_100k", "Crime rate per 100k"),
        ("hospitals_per_100k", "Hospitals per 100k"),
        ("beds_per_10k", "Beds per 10k"),
        ("stress_index", "Stress Index (z-score composite)"),
    ]

    # ---- A) Map a single year (latest in your common panel)
    year_latest = int(df["year"].max())
    df_year = df[df["year"] == year_latest].copy()

    merged_year = gdf.merge(df_year, on="marz", how="left")

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

    # ---- B) Map average over 2016–2022 (or whatever exists)
    df_avg = df.groupby("marz", as_index=False)[[c for c, _ in indicators if c in df.columns]].mean(numeric_only=True)
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
