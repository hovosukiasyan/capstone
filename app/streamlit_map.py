# app/streamlit_map.py
from __future__ import annotations

from pathlib import Path
import re

import pandas as pd
import geopandas as gpd
import plotly.express as px
import streamlit as st


# --------------------
# Paths (relative to project root)
# --------------------
PROJECT_ROOT = Path(__file__).resolve().parent.parent

GEOJSON_PATH = PROJECT_ROOT / "data" / "raw" / "geo" / "geoBoundaries-ARM-ADM1_simplified.geojson"
DATA_PATH = PROJECT_ROOT / "data" / "processed" / "panel" / "marz_year_panel_common_with_stress.csv"


# --------------------
# Name normalization (keep consistent everywhere)
# --------------------
CANON = {
    "Gegarkunik": "Gegharkunik",
    "Gegharkunik": "Gegharkunik",
    "Yerevan city": "Yerevan",
    "City Yerevan": "Yerevan",
}


def norm_marz_name(x: str) -> str:
    if pd.isna(x):
        return x

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


# --------------------
# Streamlit config
# --------------------
st.set_page_config(page_title="Armenia Marz Dashboard", layout="wide")

st.title("Armenia Marz Dashboard")
st.caption("Interactive choropleths built from ArmStat PxWeb panel + geoBoundaries ADM1.")

with st.expander("What am I looking at? (Data + definitions)", expanded=True):
    st.markdown(
        """
This dashboard visualizes **marz-level indicators** for Armenia by combining:
- **ArmStat PxWeb** tables (poverty, registered crimes, health system capacity),
- **Population** (for per-capita normalization),
- **geoBoundaries ADM1** polygons (for choropleth maps).

Interpretation: Higher values indicate higher relative stress (worse conditions);
lower values indicate lower relative stress. Values are comparable across marzes
within the same time window.


**Important:** Most maps should be interpreted using **rates** (per-capita) rather than raw counts, because marzes have different population sizes.
"""
    )

@st.cache_data
def load_panel() -> pd.DataFrame:
    if not DATA_PATH.exists():
        raise FileNotFoundError(
            f"Missing dataset: {DATA_PATH}\n"
            "Make sure you saved your notebook output to:\n"
            "data/processed/panel/marz_year_panel_common_with_stress.csv"
        )
    df = pd.read_csv(DATA_PATH)
    df["marz"] = df["marz"].apply(norm_marz_name).astype(str)
    df["year"] = pd.to_numeric(df["year"], errors="coerce").astype(int)
    return df


@st.cache_data
def load_geo() -> gpd.GeoDataFrame:
    if not GEOJSON_PATH.exists():
        raise FileNotFoundError(f"Missing GeoJSON: {GEOJSON_PATH}")

    gdf = gpd.read_file(GEOJSON_PATH)

    # geoBoundaries ADM1 uses shapeName for region name
    if "shapeName" not in gdf.columns:
        raise RuntimeError(
            f"Expected 'shapeName' in GeoJSON properties. Found columns: {list(gdf.columns)}"
        )

    gdf = gdf[["shapeName", "geometry"]].copy()
    gdf["marz"] = gdf["shapeName"].apply(norm_marz_name).astype(str)
    gdf = gdf.drop(columns=["shapeName"])

    if gdf.crs is None:
        gdf = gdf.set_crs("EPSG:4326")
    else:
        gdf = gdf.to_crs("EPSG:4326")

    return gdf


df = load_panel()
gdf = load_geo()
years = sorted(df["year"].unique().tolist())
latest_year = max(years)

# --------------------
# UI controls
# --------------------
indicator_options = {
    "Stress Index": ("stress_index", "Stress Index (z-score composite)"),
    "Poverty rate (%)": ("poverty_rate", "Poverty rate (%)"),
    "Crime rate per 100k": ("crime_rate_per_100k", "Crime rate per 100k"),
    "Hospitals per 100k": ("hospitals_per_100k", "Hospitals per 100k"),
    "Beds per 10k": ("beds_per_10k", "Beds per 10k"),
    "Crimes total (counts)": ("crime_total", "Registered crimes (total count)"),
    "Hospitals (counts)": ("hospitals", "Hospitals (count)"),
}

left, right = st.columns([1, 1], gap="large")
with left:
    indicator_label = st.selectbox("Indicator", list(indicator_options.keys()), index=0)
with right:
    mode = st.radio("Time view", ["Single year", "Average (2016–2022)"], horizontal=True)

value_col, pretty_title = indicator_options[indicator_label]

indicator_help = {
    "stress_index": """
**Stress Index (main composite indicator).**  
A single score that summarizes *multiple* dimensions:
- poverty (poverty_rate),
- crime pressure (crime_rate_per_100k),
- health system capacity proxies (e.g., hospitals_per_100k, beds_per_10k).

Computed using **z-scores** per year (standardized values), then combined.
**Interpretation:** higher stress_index ⇒ higher overall socio-economic stress (relative to other marzes in the same time window).
""",
    "poverty_rate": """
**Poverty rate (%).**  
Share of population classified as poor (ArmStat definition).  
**Interpretation:** higher ⇒ worse.
""",
    "crime_rate_per_100k": """
**Crime rate per 100k.**  
Registered crimes total divided by population, multiplied by 100,000.  
**Interpretation:** higher ⇒ more registered crime pressure (more comparable than raw totals).
""",
    "hospitals_per_100k": """
**Hospitals per 100k.**  
Number of hospitals divided by population, multiplied by 100,000.  
**Interpretation:** higher can mean more capacity/access (context matters; small marzes can look high with few hospitals).
""",
    "beds_per_10k": """
**Beds per 10k.**  
Hospital beds divided by population, multiplied by 10,000.  
**Interpretation:** higher ⇒ more inpatient capacity per person.
""",
    "crime_total": """
**Registered crimes total (count).**  
Raw number of registered crimes (not normalized).  
**Interpretation:** strongly influenced by population size; use crime_rate_per_100k for fair comparisons.
""",
    "hospitals": """
**Hospitals (count).**  
Raw number of hospitals in the marz.  
**Interpretation:** use hospitals_per_100k for fair comparison across marzes.
""",
}

st.info(indicator_help.get(value_col, ""))


if value_col not in df.columns:
    st.error(f"Column not found in dataset: {value_col}")
    st.stop()

if mode == "Single year":
    year = st.slider("Year", min_value=min(years), max_value=max(years), value=latest_year, step=1)
    df_view = df[df["year"] == year][["marz", value_col]].copy()
    title = f"{pretty_title} — {year}"
else:
    # Average over all years present in your dataset (typically 2016–2022)
    df_view = df.groupby("marz", as_index=False)[value_col].mean(numeric_only=True)
    title = f"Average {pretty_title} — 2016–2022"

# Always merge data INTO the geometry (stable mapping)
view_gdf = gdf.merge(df_view, on="marz", how="left")
view_gdf = view_gdf.reset_index(drop=True)
view_gdf["fid"] = view_gdf.index.astype(int)

# Diagnostics: tell you exactly what's missing (helps instantly)
missing = view_gdf.loc[view_gdf[value_col].isna(), "marz"].tolist()
if missing:
    st.warning(f"Missing values for {value_col} in: {', '.join(missing)}")

# Build geojson from the merged gdf (features contain properties.marz)
geojson = view_gdf.__geo_interface__

# Hover fields (NEVER pass True/False to hover_data — it can break)
hover_data = {value_col: True}
if value_col == "stress_index":
    hover_data = {value_col: ":.3f"}

# Compute a reasonable center (avoid weird zoom)
centroid = view_gdf.to_crs("EPSG:4326").geometry.unary_union.centroid
center = {"lat": float(centroid.y), "lon": float(centroid.x)}

fig = px.choropleth_mapbox(
    view_gdf,
    geojson=geojson,
    locations="marz",
    featureidkey="properties.marz",
    color=value_col,
    hover_name="marz",
    hover_data=hover_data,
    title=title,
    mapbox_style="carto-positron",  # NO TOKEN REQUIRED
    center=center,
    zoom=6.2,
    opacity=0.85,
)

fig.update_layout(margin={"r": 0, "t": 60, "l": 0, "b": 0})

# --------------------
# Layout: Map + ranking table
# --------------------
map_col, table_col = st.columns([2, 1], gap="large")

with map_col:
    st.plotly_chart(fig, use_container_width=True)

with table_col:
    st.subheader("Ranking")
    ranking = view_gdf[["marz", value_col]].dropna().sort_values(value_col, ascending=False)

    st.write("Top (highest values)")
    st.dataframe(ranking.head(10), use_container_width=True, hide_index=True)

    st.write("Bottom (lowest values)")
    st.dataframe(ranking.tail(10), use_container_width=True, hide_index=True)

st.divider()

# Optional: show raw rows for selected marz over time
st.subheader("Explore one marz over time")
chosen_marz = st.selectbox("Marz", sorted(df["marz"].unique().tolist()))
sub = df[df["marz"] == chosen_marz].sort_values("year")

cols_show = ["marz", "year", "poverty_rate", "crime_rate_per_100k", "hospitals_per_100k", "beds_per_10k"]
if "stress_index" in df.columns:
    cols_show.append("stress_index")

st.dataframe(sub[cols_show], use_container_width=True, hide_index=True)
