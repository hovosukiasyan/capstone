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

- Join any table to households: `FROM ilcs.hh h JOIN ilcs.members m ON h.recno = m.recno`
- Use `ilcs.variable_labels` and `ilcs.value_labels` to look up what each column and code means.
