from __future__ import annotations

from pathlib import Path
import pandas as pd

PROJECT_ROOT = Path(__file__).resolve().parent.parent

TIDY_DIR = PROJECT_ROOT / "data" / "processed" / "tidy"
PANEL_DIR = PROJECT_ROOT / "data" / "processed" / "panel"
OUT_DIR = PROJECT_ROOT / "data" / "processed" / "deliverables"
OUT_DIR.mkdir(parents=True, exist_ok=True)

OUT_PATH = OUT_DIR / "armstat_panel_workbook.xlsx"


def read_csv(path: Path) -> pd.DataFrame:
    if not path.exists():
        raise FileNotFoundError(f"Missing file: {path}")
    return pd.read_csv(path)


def main() -> None:
    # Core sheets
    poverty = read_csv(TIDY_DIR / "poverty_tidy.csv")
    population = read_csv(TIDY_DIR / "population_tidy.csv")
    crime_selected_total = read_csv(TIDY_DIR / "crime_selected_total.csv")
    crime_severity_wide = read_csv(TIDY_DIR / "crime_severity_wide.csv")
    health_wide = read_csv(TIDY_DIR / "health_wide.csv")

    panel_common = read_csv(PANEL_DIR / "marz_year_panel_common.csv")

    # If you created this in notebook:
    stress_path = PANEL_DIR / "marz_year_panel_common_with_stress.csv"
    panel_with_stress = read_csv(stress_path) if stress_path.exists() else None

    # README sheet content
    readme = pd.DataFrame(
        {
            "Sheet": [
                "poverty_tidy",
                "crime_selected_total",
                "crime_severity_wide",
                "health_wide",
                "population_tidy",
                "panel_common_2016_2022",
                "panel_common_with_stress",
            ],
            "Description": [
                "Poverty rates by marz-year (poor/extremely poor/non-poor).",
                "Sum of selected crime types by marz-year (from ps-ls-oc03).",
                "Crime totals + severity breakdown by marz-year (from ps-ls-oc02).",
                "Health system capacity indicators by marz-year (from ps-si-hms33).",
                "Population by marz-year (used for per-capita normalization).",
                "Merged analysis-ready panel (intersection years 2016–2022).",
                "Panel with computed Stress Index (z-scored composite indicator).",
            ],
        }
    )

    with pd.ExcelWriter(OUT_PATH, engine="openpyxl") as writer:
        readme.to_excel(writer, sheet_name="README", index=False)

        poverty.to_excel(writer, sheet_name="poverty_tidy", index=False)
        crime_selected_total.to_excel(writer, sheet_name="crime_selected_total", index=False)
        crime_severity_wide.to_excel(writer, sheet_name="crime_severity_wide", index=False)
        health_wide.to_excel(writer, sheet_name="health_wide", index=False)
        population.to_excel(writer, sheet_name="population_tidy", index=False)

        panel_common.to_excel(writer, sheet_name="panel_common_2016_2022", index=False)

        if panel_with_stress is not None:
            panel_with_stress.to_excel(writer, sheet_name="panel_common_with_stress", index=False)

    print(f"[OK] Excel workbook created: {OUT_PATH}")


if __name__ == "__main__":
    main()
