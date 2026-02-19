#!/usr/bin/env python3
"""
Postprocessing: rename columns in ml_households.csv to meaningful short names
derived from variable labels. Uses a manual mapping for important variables and
a smarter heuristic (strip question phrasing, take meaningful words) for the rest.

Expects ml_households.csv to have **original** column names (recno, marz, c1, ...).
If you already ran an older rename and have unclear names, run:
  python scripts/ilcs_build_ml_dataset.py
then run this script again.

Reads: data/ilcs/ml_households.csv, data/ilcs/ml_households_variable_labels.csv
Writes: data/ilcs/ml_households.csv (overwrite), data/ilcs/column_name_mapping.csv
"""

from __future__ import annotations

import re
from pathlib import Path

import pandas as pd

THIS_FILE = Path(__file__).resolve()
PROJECT_ROOT = THIS_FILE.parent.parent
ILCS_DIR = PROJECT_ROOT / "data" / "ilcs"
ML_CSV = ILCS_DIR / "ml_households.csv"
VAR_LABELS_CSV = ILCS_DIR / "ml_households_variable_labels.csv"
MAPPING_CSV = ILCS_DIR / "column_name_mapping.csv"

# Keep as-is
KEEP_AS_IS = {"recno", "date", "year", "weight"}

# Derived columns (not in DDI)
DERIVED_COLUMN_NAMES = {
    "sample_weight": "sample_weight",
    "n_members": "household_member_count",
    "mean_age": "household_mean_age",
    "income_total": "household_income_total",
    "income_sources": "household_income_source_count",
    "food_purchases_total": "food_purchases_total",
    "services_goods_total": "services_goods_total",
    "goods_services_total": "goods_services_total",
}

# Manual mapping: original variable name -> clear short name (what the column represents)
MANUAL_RENAME: dict[str, str] = {
    "marz": "region",
    "members": "household_size",
    "typev": "area_type",
    "a3": "household_has_special_education_children",
    "c1": "housing_type",
    "c2": "dwelling_ownership",
    "c3_1": "monthly_rent_amd",
    "c3_2": "monthly_rent_usd",
    "c3_3": "monthly_rent_eur",
    "c4": "number_of_rooms",
    "c5": "dwelling_space_sqm",
    "c6": "moved_last_5_years",
    "c7": "reason_moved",
    "c8_1": "has_centralized_water",
    "c8_2": "has_hot_water",
    "c8_3": "has_centralized_sanitation",
    "c8_4": "has_local_sanitation",
    "c8_5": "has_outside_toilet",
    "c8_6": "has_gas",
    "c8_7": "has_bathtub_shower",
    "c8_8": "has_kitchen",
    "c8_9": "has_telephone",
    "c8_10": "has_mobile",
    "c8_11": "has_radio",
    "c8_12": "has_electricity",
    "c8_13": "has_computer",
    "c8_14": "has_internet",
    "c9": "water_source",
    "c10": "water_tap_location",
    "c10_1": "water_tap_distance",
    "c11_1": "potable_water_hours_day",
    "c11_2": "potable_water_24h",
    "c12_1": "main_heating_energy",
    "c12_2": "supplementary_heating_energy",
    "c13_1": "heating_equipment_electric_stove",
    "c13_2": "heating_equipment_oil_heater",
    "c13_3": "heating_equipment_gas_stove",
    "c13_4": "heating_equipment_self_made",
    "c13_5": "heating_equipment_manufactured",
    "c13_6": "heating_equipment_boiler",
    "c13_7": "heating_equipment_collective_boiler",
    "c13_8": "heating_equipment_centralized",
    "c13_9": "heating_equipment_other",
    "c14": "heating_spend_last_winter_amd",
    "c15": "garbage_disposal",
    "c16_1": "complaint_floor_space",
    "c16_2": "complaint_noise",
    "c16_3": "complaint_light",
    "c16_4": "complaint_heating",
    "c16_5": "complaint_humidity",
    "c16_6": "complaint_leaking_roof",
    "c16_7": "complaint_walls_floor",
    "c16_8": "complaint_windows_doors",
    "c16_9": "complaint_traffic",
    "c16_10": "complaint_pollution",
    "c16_11": "complaint_elevator",
    "c16_12": "complaint_water_supply",
    "c16_13": "complaint_garbage",
    "c16_14": "complaint_common_areas",
    "c16_15": "complaint_green_areas",
    "c16_16": "complaint_other",
    "c17": "dwelling_condition_estimate",
    "c18": "dwelling_renovated",
    "c19": "renovation_years_ago",
    "c20_1": "renovation_spend_amd",
    "c20_2": "renovation_spend_usd",
    "c20_3": "renovation_spend_eur",
    "c21": "building_new_house",
    "c22_1": "new_house_spend_amd",
    "c22_2": "new_house_spend_usd",
    "c22_3": "new_house_spend_eur",
    "c23": "has_other_dwelling",
    "c24_1": "rent_income_amd",
    "c24_2": "rent_income_usd",
    "c24_3": "rent_income_eur",
    "c25_1": "computer_access_home",
    "c25_2": "computer_access_elsewhere",
    "c25_3": "internet_home_permanent",
    "c25_4": "internet_home_non_permanent",
    "c25_5": "internet_work",
    "c25_6": "internet_education",
    "c25_7": "internet_other_household",
    "c25_8": "internet_public_free",
    "c25_9": "internet_public_paid",
    "c25_10": "internet_cellphone",
    "c25_11": "internet_other_place",
    "c26": "household_owns_car",
    "c27_1": "vehicle_costs_fuel_12m",
    "c27_1_1": "vehicle_petrol",
    "c27_1_2": "vehicle_compressed_gas",
    "c27_1_3": "vehicle_diesel",
    "c27_2": "vehicle_maintenance_12m",
    "c27_3": "transport_fares_12m",
    "h2_1": "transfers_received_member_id",
    "h2_2": "transfers_sender_location",
    "h2_3": "transfers_frequency",
    "h2_4": "transfers_amount_12m",
    "h2_4drm": "transfers_amount_amd",
    "h2_5": "transfers_currency",
    "h2_6": "transfers_transfer_method",
    "h2_7": "transfers_purpose",
    "h2_8": "transfers_food_value_12m",
    "h2_9": "transfers_nonfood_value_12m",
    "h1": "household_sent_money_goods_12m",
    "h2": "household_received_money_goods_12m",
    "j1": "lent_money_12m",
    "j1_1": "lent_to_residents",
    "j1_2": "lent_to_nonresidents",
    "j3": "family_debt_amount",
    "j3_1": "debt_to_residents",
    "j3_2": "debt_to_nonresidents",
    "j4": "borrowed_money_12m",
    "j4_1": "borrowed_from_residents",
    "j4_2": "borrowed_from_nonresidents",
    "m1": "registered_poverty_benefit",
    "m2": "reason_not_registered_benefit",
    "m3": "benefit_years_entitled",
    "m4": "emergency_benefit_times_12m",
    "m5": "informed_benefit_termination_reasons",
    "m6": "benefit_termination_reasons_clear",
    "m7": "easy_collect_documents",
    "m8": "paid_for_documents",
    "m9": "satisfied_regional_inspector",
    "m10": "informed_ssm_changes",
    "m11": "benefit_system_justified",
    "m12": "share_families_really_vulnerable",
    "m13": "humanitarian_assistance_12m",
    "z1": "eligible_salary_pension_not_received",
    "n1": "hired_household_workers_12m",
    "p1": "liquid_gas_consumed_kg",
    "p2": "kerosene_consumed_liters",
    "p3": "diesel_consumed_liters",
    "p4": "coal_consumed",
    "p5_1": "firewood_consumed_m3",
    "p5_2": "firewood_own_stored_m3",
    "p6": "pressed_dung_consumed_kg",
    "p7": "other_energy_consumed_kg",
    "p8_1": "household_has_car",
    "p8_2_1": "car_fuel_petrol_liters",
    "p8_2_2": "car_fuel_diesel_liters",
    "p8_2_3": "car_fuel_compressed_gas_dram",
}

# Question stems to strip (regex, case-insensitive) so we keep the meaningful part
QUESTION_PREFIXES = re.compile(
    r"^(how\s+much|what\s+is|what\s+was|did\s+you|do\s+you|does\s+the|has\s+the|have\s+you|"
    r"how\s+many|how\s+regular|where\s+is|if\s+you|for\s+what|what\s+main|what\s+equipment|"
    r"what\s+sources|what\s+supplementary|why\s+did|why\s+the|are\s+you|how\s+does|"
    r"approximately\s+how\s+much|during\s+the\s+past|is\s+the\s+household|did\s+the\s+household|"
    r"were\s+you|was\s+it|did\s+any|does\s+someone|if\s+yes|if\s+no|if\s+family|"
    r"three\s+main\s+difficulties|estimation\s+of\s+the\s+quality\s+of)\s+",
    re.I,
)
STOPWORDS = frozenset(
    "the your you of to a an is are do does did have has had was were for from in on at by with or and it its".split()
)
MAX_WORDS = 5


def label_to_short_name(label: str) -> str:
    """Convert variable label to a meaningful short name: strip question phrasing, take key words."""
    if not label or not str(label).strip():
        return ""
    s = str(label).strip()
    # Remove parenthetical content
    s = re.sub(r"\s*\([^)]*\)\s*", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    # Strip question prefix
    s = QUESTION_PREFIXES.sub("", s, count=1).strip()
    # Take words, drop stopwords, take up to MAX_WORDS
    words = [w for w in s.split() if w.lower() not in STOPWORDS][:MAX_WORDS]
    if not words:
        return ""
    name = "_".join(w.lower() for w in words)
    name = re.sub(r"[^a-z0-9_]", "", name)
    name = re.sub(r"_+", "_", name).strip("_")
    return name or ""


def build_rename_mapping(
    df_columns: list[str],
    var_labels: pd.DataFrame,
) -> tuple[dict[str, str], list[tuple[str, str, str]]]:
    label_by_var = dict(zip(var_labels["variable"], var_labels["variable_label"]))
    mapping: list[tuple[str, str, str]] = []
    rename: dict[str, str] = {}
    used_short: dict[str, int] = {}

    for col in df_columns:
        full = label_by_var.get(col, "")
        if col in KEEP_AS_IS:
            short = col
        elif col in DERIVED_COLUMN_NAMES:
            short = DERIVED_COLUMN_NAMES[col]
        elif col in MANUAL_RENAME:
            short = MANUAL_RENAME[col]
        elif full:
            short = label_to_short_name(full)
            if not short:
                short = col
            if short in used_short:
                used_short[short] += 1
                short = f"{short}_{used_short[short]}"
            else:
                used_short[short] = 1
        else:
            short = col
        rename[col] = short
        mapping.append((col, short, full or "(no label)"))
    return rename, mapping


def main() -> None:
    if not ML_CSV.exists():
        raise SystemExit(f"Not found: {ML_CSV}. Run ilcs_build_ml_dataset.py first.")
    if not VAR_LABELS_CSV.exists():
        raise SystemExit(f"Not found: {VAR_LABELS_CSV}. Run ilcs_export_ml_codebook.py first.")

    df = pd.read_csv(ML_CSV, low_memory=False)
    var_labels = pd.read_csv(VAR_LABELS_CSV)
    known_vars = set(var_labels["variable"])

    # If CSV has already-renamed columns (not in variable_labels), we need original names
    missing = [c for c in df.columns if c not in known_vars and c not in KEEP_AS_IS and c not in DERIVED_COLUMN_NAMES and c not in MANUAL_RENAME]
    if len(missing) > 200:  # most columns unknown => likely already renamed
        print("CSV columns do not match variable labels (likely already renamed).")
        print("Run: python scripts/ilcs_build_ml_dataset.py   then run this script again.")
        raise SystemExit(1)

    rename, mapping = build_rename_mapping(df.columns.tolist(), var_labels)
    df_renamed = df.rename(columns=rename)

    ILCS_DIR.mkdir(parents=True, exist_ok=True)
    df_renamed.to_csv(ML_CSV, index=False)
    print(f"Wrote {ML_CSV} with {len(rename)} columns renamed.")

    mapping_df = pd.DataFrame(mapping, columns=["original_name", "short_name", "full_question"])
    mapping_df.to_csv(MAPPING_CSV, index=False)
    print(f"Wrote {MAPPING_CSV}.")


if __name__ == "__main__":
    main()
