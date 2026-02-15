# ILCS 2015 data and PostgreSQL loader

## Data

- **CSV folder:** `ARM_2015_ILCS_v02_M_CSV/` — one CSV per survey module (hh, mem, weight, x1–x5, y1, z3, f4, g1, h1, h2).
- **Link key:** `recno` = household ID. All tables can be joined on `recno`. The members table also has `memnum` (member within household).
- **Metadata:** `ARM_2015_ILCS_v02_M.xml` — DDI codebook (variable and value labels).

## Load into PostgreSQL

1. Install dependencies: `pip install -r requirements.txt` (includes `psycopg2-binary`, `sqlalchemy`).
2. Set connection:
   - Either `export DATABASE_URL=postgresql://user:password@host:port/db`
   - Or set `POSTGRES_HOST`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` (and optionally `POSTGRES_PORT`). See project root `.env.example`.
3. From project root run:
   ```bash
   python scripts/ilcs_load_to_postgres.py
   ```

The script will:

- Create schema **`ilcs`** and tables: `hh`, `mem`, `weight`, `f4`, `g1`, `h1`, `h2`, `x1`, `x2`, `x3`, `x4`, `x5`, `y1`, `z3`.
- Load all CSVs into those tables (column names lowercased and sanitized).
- Parse the DDI XML and fill **`ilcs.variable_labels`** (variable name, label per table) and **`ilcs.value_labels`** (value codes and their labels for categorical variables).

## Querying

- Join any table to households: `FROM ilcs.hh h JOIN ilcs.mem m ON h.recno = m.recno`
- Use `ilcs.variable_labels` and `ilcs.value_labels` to look up what each column and code means.

## ML-ready household dataset

A single table with one row per household (5,184 rows) is built by joining hh + weight + member aggregates (from mem) + income (y1, h2) + optional consumption aggregates (x1, x4, z3). Use it for poverty or welfare modeling without joining tables yourself.

- **Build from CSV (no Postgres needed):**
  ```bash
  python scripts/ilcs_build_ml_dataset.py
  ```
  Writes **`data/ilcs/ml_households.csv`**.

- **Build from Postgres and also write table `ilcs.ml_households`:**
  ```bash
  python scripts/ilcs_build_ml_dataset.py --postgres
  ```

- **Build from Postgres but write only CSV:**
  ```bash
  python scripts/ilcs_build_ml_dataset.py --postgres --csv-only
  ```

Key derived columns in the ML table: `sample_weight`, `n_members`, `mean_age`, `income_total`, `income_sources`, and (if available) `food_purchases_total`, `services_goods_total`, `goods_services_total`, plus all original hh and h2 columns.

---

## Reference files for the ML dataset (codebooks)

The ML table (`ml_households.csv`) contains many **categorical variables** stored as numbers (e.g. `marz` = 1 for Yerevan, 2 for Aragatsotn, …). To interpret them you need a **codebook**. Two reference files sit next to the ML data and are generated from the same DDI codebook (the XML).

| File | Description |
|------|--------------|
| **`ml_households_codebook.csv`** | One row per (variable, value): **variable**, **variable_label**, **value**, **value_label**. Use it to decode codes (e.g. marz 1 → Yerevan, typev 3 → rural). |
| **`ml_households_variable_labels.csv`** | One row per variable: **variable**, **variable_label**. Short reference for “what does this column mean?” without value details. |

**Source:** Both are extracted from `ARM_2015_ILCS_v02_M.xml` for variables that appear in the ML table and come from the **hh** (housing) and **h2** (household income) questionnaires.

**Generate or refresh the codebook** (e.g. after rebuilding `ml_households.csv` or when you want to pick up XML changes):

```bash
python scripts/ilcs_export_ml_codebook.py
```

This script reads the XML and the current `ml_households.csv` column list, then writes `ml_households_codebook.csv` and `ml_households_variable_labels.csv` under `data/ilcs/`.

**Using the codebook in code:** Load the codebook and merge or lookup by variable name and value. Example (pandas):

```python
import pandas as pd
df = pd.read_csv("data/ilcs/ml_households.csv")
codebook = pd.read_csv("data/ilcs/ml_households_codebook.csv")
# Decode marz: keep only marz rows, then merge
marz_labels = codebook[codebook["variable"] == "marz"][["value", "value_label"]].rename(columns={"value": "marz", "value_label": "marz_name"})
df = df.merge(marz_labels, on="marz", how="left")
```

**Important variables with defined value sets:** e.g. **marz** (region: 1=Yerevan, 2=Aragatsotn, 3=Ararat, 4=Armavir, 5=Gegharkunik, 6=Lori, 7=Kotayk, 8=Shirak, 9=Sjunik, 10=Vayots Dzor, 11=Tavush), **typev** (area type: 1=Yerevan, 2=other urban, 3=rural), **date** (month 1–12), plus dozens of c8_*, c9, h2_*, etc. Full lists are in the codebook CSVs.

---

## What happens (overview)

| Step | Script | Input | Output |
|------|--------|--------|--------|
| Load raw survey into DB | `ilcs_load_to_postgres.py` | CSVs + XML | Postgres schema `ilcs` (tables hh, mem, weight, … + variable_labels, value_labels) |
| Build one table per household for ML | `ilcs_build_ml_dataset.py` | CSVs (or Postgres) | `ml_households.csv` |
| Export codebook for ML table | `ilcs_export_ml_codebook.py` | XML + `ml_households.csv` (for column list) | `ml_households_codebook.csv`, `ml_households_variable_labels.csv` |

So: **raw data** lives in CSVs and (optionally) Postgres; **ML dataset** is the single CSV plus the two codebook CSVs so you can work with one dataset and one reference without opening the XML or the DB.
