#!/usr/bin/env tsx
/**
 * Seed the PostgreSQL database with all capstone data.
 *
 * Usage (from web/ directory):
 *   npx tsx scripts/seed.ts
 *
 * Requires DATABASE_URL in .env.local or environment.
 */

import { readFileSync, writeFileSync, copyFileSync } from 'fs';
import { join } from 'path';
import { parse } from 'csv-parse/sync';
import { Pool } from 'pg';

// ── Load .env.local ────────────────────────────────────────────────────────────
try {
  const envPath = join(__dirname, '..', '.env.local');
  const envContent = readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    process.env[key] = val;
  }
} catch {
  // .env.local not found — DATABASE_URL must be set in environment
}

const PROJECT_ROOT = join(__dirname, '..', '..'); // /Capstone
const PUBLIC_DIR = join(__dirname, '..', 'public');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run(sql: string, params?: unknown[]) {
  const client = await pool.connect();
  try {
    await client.query(sql, params);
  } finally {
    client.release();
  }
}

async function runReturning<T>(sql: string, params?: unknown[]): Promise<T[]> {
  const client = await pool.connect();
  try {
    const res = await client.query(sql, params);
    return res.rows as T[];
  } finally {
    client.release();
  }
}

function readCsv(path: string): Record<string, string>[] {
  const content = readFileSync(path, 'utf-8');
  return parse(content, { columns: true, skip_empty_lines: true, trim: true });
}

function num(v: string | undefined): number | null {
  if (v === undefined || v === '' || v === 'NA' || v === 'NaN' || v === 'nan') return null;
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
}

function normalizeMarzName(name: string): string {
  if (!name) return name;
  const CANON: Record<string, string> = {
    'Gegarkunik': 'Gegharkunik',
    'Gegharkunik': 'Gegharkunik',
    'Yerevan city': 'Yerevan',
    'City Yerevan': 'Yerevan',
  };
  let s = name.trim().replace(/\s+/g, ' ');
  s = CANON[s] ?? s;
  let sLower = s.toLowerCase();
  sLower = sLower.replace(' marz', '').replace(' city', '').replace('city ', '').trim();
  const normalized = sLower.split(' ').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  if (normalized.toLowerCase() === 'yerevan') return 'Yerevan';
  return normalized;
}

// ── Schema creation ────────────────────────────────────────────────────────────
async function createSchema() {
  console.log('Creating schema capstone...');
  await run('CREATE SCHEMA IF NOT EXISTS capstone');

  await run(`DROP TABLE IF EXISTS capstone.tsne_coords CASCADE`);
  await run(`DROP TABLE IF EXISTS capstone.households CASCADE`);
  await run(`DROP TABLE IF EXISTS capstone.regional_panel CASCADE`);
  await run(`DROP TABLE IF EXISTS capstone.feature_importance CASCADE`);
  await run(`DROP TABLE IF EXISTS capstone.model_metrics CASCADE`);
  await run(`DROP TABLE IF EXISTS capstone.forecasting_results CASCADE`);

  await run(`
    CREATE TABLE capstone.households (
      id                            SERIAL PRIMARY KEY,
      interview_month               SMALLINT,
      household_size                SMALLINT,
      dwelling_ownership            SMALLINT,
      number_of_rooms               SMALLINT,
      has_computer                  SMALLINT,
      has_other_dwelling            SMALLINT,
      household_has_car             SMALLINT,
      potable_water_hours_day       REAL,
      heating_spend_last_winter_amd REAL,
      dwelling_condition_estimate   SMALLINT,
      dwelling_renovated            SMALLINT,
      building_new_house            SMALLINT,
      household_sent_money_goods_12m    SMALLINT,
      household_received_money_goods_12m SMALLINT,
      lent_money_12m                SMALLINT,
      family_debt_amount            REAL,
      borrowed_money_12m            SMALLINT,
      registered_poverty_benefit    SMALLINT,
      share_families_really_vulnerable  SMALLINT,
      humanitarian_assistance_12m   SMALLINT,
      money_family_need_monthly_live REAL,
      drm_in_amd                    REAL,
      money_family_need_monthly_make REAL,
      amd_3                         REAL,
      household_income_total        REAL,
      household_income_source_count SMALLINT,
      food_purchases_total          REAL,
      services_goods_total          REAL,
      goods_services_total          REAL,
      log_income                    REAL
    )
  `);

  await run(`
    CREATE TABLE capstone.regional_panel (
      id                    SERIAL PRIMARY KEY,
      marz                  TEXT NOT NULL,
      date                  DATE NOT NULL,
      year                  SMALLINT NOT NULL,
      month                 SMALLINT NOT NULL,
      poverty_rate          REAL,
      extreme_poverty_rate  REAL,
      non_poor_rate         REAL,
      population            REAL,
      crime_total           REAL,
      crime_selected_total  REAL,
      crime_rate_per_100k   REAL,
      crime_selected_rate_per_100k REAL,
      hospitals             REAL,
      hospitals_per_100k    REAL,
      beds                  REAL,
      beds_per_10k          REAL,
      stress_index          REAL
    )
  `);

  await run(`
    CREATE TABLE capstone.feature_importance (
      id         SERIAL PRIMARY KEY,
      model      TEXT NOT NULL,
      feature    TEXT NOT NULL,
      importance REAL NOT NULL
    )
  `);

  await run(`
    CREATE TABLE capstone.model_metrics (
      model                TEXT PRIMARY KEY,
      r2                   REAL,
      mae                  REAL,
      rmse                 REAL,
      is_bayesian_optimized BOOLEAN DEFAULT FALSE
    )
  `);

  await run(`
    CREATE TABLE capstone.forecasting_results (
      id        SERIAL PRIMARY KEY,
      source    TEXT NOT NULL,
      model     TEXT NOT NULL,
      frequency TEXT,
      r2        REAL,
      mse       REAL,
      mae       REAL
    )
  `);

  await run(`
    CREATE TABLE capstone.tsne_coords (
      id             INTEGER PRIMARY KEY,
      x              REAL NOT NULL,
      y              REAL NOT NULL,
      cluster        SMALLINT,
      income_decile  SMALLINT
    )
  `);

  // Indexes
  await run(`CREATE INDEX ON capstone.households(household_income_total)`);
  await run(`CREATE INDEX ON capstone.households(interview_month)`);
  await run(`CREATE INDEX ON capstone.households(household_size)`);
  await run(`CREATE INDEX ON capstone.regional_panel(marz)`);
  await run(`CREATE INDEX ON capstone.regional_panel(year)`);
  await run(`CREATE INDEX ON capstone.regional_panel(date)`);
  await run(`CREATE INDEX ON capstone.feature_importance(model)`);

  console.log('Schema created.');
}

// ── Households ─────────────────────────────────────────────────────────────────
async function seedHouseholds() {
  const csvPath = join(
    PROJECT_ROOT,
    'data/ilcs/research/ml_households_research_columns_imputed.csv'
  );
  console.log('Loading households from', csvPath);
  const rows = readCsv(csvPath);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const r of rows) {
      const income = num(r.household_income_total);
      const logIncome = income && income > 0 ? Math.log10(income) : null;
      // KNN-imputed data can have non-integer values in ordinal/binary columns — round them
      const ri = (v: string | undefined) => {
        const n = num(v);
        return n === null ? null : Math.round(n);
      };
      await client.query(
        `INSERT INTO capstone.households (
          interview_month, household_size, dwelling_ownership, number_of_rooms,
          has_computer, has_other_dwelling, household_has_car, potable_water_hours_day,
          heating_spend_last_winter_amd, dwelling_condition_estimate, dwelling_renovated,
          building_new_house, household_sent_money_goods_12m,
          household_received_money_goods_12m, lent_money_12m, family_debt_amount,
          borrowed_money_12m, registered_poverty_benefit, share_families_really_vulnerable,
          humanitarian_assistance_12m, money_family_need_monthly_live, drm_in_amd,
          money_family_need_monthly_make, amd_3, household_income_total,
          household_income_source_count, food_purchases_total, services_goods_total,
          goods_services_total, log_income
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
          $21,$22,$23,$24,$25,$26,$27,$28,$29,$30
        )`,
        [
          ri(r.interview_month), ri(r.household_size), ri(r.dwelling_ownership),
          ri(r.number_of_rooms), ri(r.has_computer), ri(r.has_other_dwelling),
          ri(r.household_has_car), num(r.potable_water_hours_day),
          num(r.heating_spend_last_winter_amd), ri(r.dwelling_condition_estimate),
          ri(r.dwelling_renovated), ri(r.building_new_house),
          ri(r.household_sent_money_goods_12m),
          ri(r.household_received_money_goods_12m), ri(r.lent_money_12m),
          num(r.family_debt_amount), ri(r.borrowed_money_12m),
          ri(r.registered_poverty_benefit), ri(r.share_families_really_vulnerable),
          ri(r.humanitarian_assistance_12m), num(r.money_family_need_monthly_live),
          num(r.drm_in_amd), num(r.money_family_need_monthly_make), num(r.amd_3),
          income, ri(r.household_income_source_count), num(r.food_purchases_total),
          num(r.services_goods_total), num(r.goods_services_total), logIncome,
        ]
      );
    }
    await client.query('COMMIT');
    console.log(`  Inserted ${rows.length} household rows.`);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

// ── Regional panel ─────────────────────────────────────────────────────────────
async function seedRegionalPanel() {
  const monthlyPath = join(
    PROJECT_ROOT,
    'data/processed/panel/marz_monthly_panel_augmented.csv'
  );
  const yearlyPath = join(
    PROJECT_ROOT,
    'data/processed/panel/marz_year_panel_common_with_stress.csv'
  );

  console.log('Loading regional panel...');
  const monthlyRows = readCsv(monthlyPath);
  const yearlyRows = readCsv(yearlyPath);

  // Build stress_index lookup: marz × year → stress_index
  const stressMap = new Map<string, number | null>();
  for (const r of yearlyRows) {
    const marz = normalizeMarzName(r.marz);
    const year = r.year;
    const key = `${marz}::${year}`;
    stressMap.set(key, num(r.stress_index));
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const r of monthlyRows) {
      const marz = normalizeMarzName(r.marz);
      const year = r.year;
      const stressKey = `${marz}::${year}`;
      const stressIndex = stressMap.get(stressKey) ?? null;
      await client.query(
        `INSERT INTO capstone.regional_panel (
          marz, date, year, month, poverty_rate, extreme_poverty_rate, non_poor_rate,
          population, crime_total, crime_selected_total, crime_rate_per_100k,
          crime_selected_rate_per_100k, hospitals, hospitals_per_100k,
          beds, beds_per_10k, stress_index
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
        [
          marz, r.date, num(r.year), num(r.month),
          num(r.poverty_rate), num(r.extreme_poverty_rate), num(r.non_poor_rate),
          num(r.population), num(r.crime_total), num(r.crime_selected_total),
          num(r.crime_rate_per_100k), num(r.crime_selected_rate_per_100k),
          num(r.hospitals), num(r.hospitals_per_100k),
          num(r.beds), num(r.beds_per_10k), stressIndex,
        ]
      );
    }
    await client.query('COMMIT');
    console.log(`  Inserted ${monthlyRows.length} regional panel rows.`);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

// ── Feature importance ─────────────────────────────────────────────────────────
async function seedFeatureImportance() {
  const baseDir = join(PROJECT_ROOT, 'data/ilcs/research/feature_importance');
  const models = ['gbm', 'rf', 'et', 'ridge', 'lasso'];
  const fileNames: Record<string, string> = {
    gbm: 'feature_importance_gbm.csv',
    rf: 'feature_importance_rf.csv',
    et: 'feature_importance_extra_trees.csv',
    ridge: 'feature_importance_ridge.csv',
    lasso: 'feature_importance_lasso.csv',
  };

  console.log('Loading feature importance...');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const model of models) {
      const csvPath = join(baseDir, fileNames[model]);
      const rows = readCsv(csvPath);
      for (const r of rows) {
        const featureName = r.feature ?? r.Feature ?? Object.values(r)[0];
        const importanceVal = r.importance ?? r.Importance ?? Object.values(r)[1];
        await client.query(
          `INSERT INTO capstone.feature_importance (model, feature, importance) VALUES ($1,$2,$3)`,
          [model, featureName, num(String(importanceVal))]
        );
      }
      console.log(`  ${model}: ${rows.length} features loaded.`);
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

// ── Model metrics ──────────────────────────────────────────────────────────────
async function seedModelMetrics() {
  console.log('Inserting model metrics...');
  const metrics = [
    { model: 'gbm',   r2: 0.3563, mae: 82152,  rmse: 162784, opt: true },
    { model: 'rf',    r2: 0.3398, mae: 85475,  rmse: 165603, opt: true },
    { model: 'et',    r2: 0.3316, mae: 87681,  rmse: 167979, opt: true },
    { model: 'ridge', r2: 0.3153, mae: 91183,  rmse: 167894, opt: false },
    { model: 'lasso', r2: 0.3154, mae: 91186,  rmse: 167879, opt: false },
  ];
  for (const m of metrics) {
    await run(
      `INSERT INTO capstone.model_metrics (model, r2, mae, rmse, is_bayesian_optimized)
       VALUES ($1,$2,$3,$4,$5)`,
      [m.model, m.r2, m.mae, m.rmse, m.opt]
    );
  }
  console.log('  5 model metrics inserted.');
}

// ── Forecasting results ────────────────────────────────────────────────────────
async function seedForecastingResults() {
  console.log('Loading forecasting results...');
  const resultsDir = join(PROJECT_ROOT, 'data/processed/results');
  const files: { path: string; source: string; hasFreq: boolean }[] = [
    {
      path: join(resultsDir, 'poverty_forecasting_results.csv'),
      source: 'poverty',
      hasFreq: false,
    },
    {
      path: join(resultsDir, 'stress_forecasting_results.csv'),
      source: 'stress',
      hasFreq: false,
    },
    {
      path: join(resultsDir, 'augmentation_baseline_results.csv'),
      source: 'augmentation_baseline',
      hasFreq: true,
    },
    {
      path: join(resultsDir, 'augmentation_nn_results.csv'),
      source: 'augmentation_nn',
      hasFreq: true,
    },
    {
      path: join(resultsDir, 'poverty_nn_activation_sweep.csv'),
      source: 'poverty_nn_activation',
      hasFreq: false,
    },
    {
      path: join(resultsDir, 'poverty_nn_layer_size_sweep.csv'),
      source: 'poverty_nn_layer',
      hasFreq: false,
    },
  ];

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const { path: csvPath, source, hasFreq } of files) {
      let rows: Record<string, string>[];
      try {
        rows = readCsv(csvPath);
      } catch {
        console.log(`  Skipping ${csvPath} (not found)`);
        continue;
      }

      for (const r of rows) {
        const model =
          r.Model ?? r.model ?? r.architecture ?? `${r.activation ?? ''}-${r.hidden_dims ?? ''}`;
        const frequency = hasFreq ? (r.frequency ?? null) : null;
        const r2 = num(r.R2 ?? r.r2);
        const mse = num(r.MSE ?? r.mse);
        const mae = num(r.MAE ?? r.mae);
        await client.query(
          `INSERT INTO capstone.forecasting_results (source, model, frequency, r2, mse, mae)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [source, model, frequency, r2, mse, mae]
        );
      }
      console.log(`  ${source}: ${rows.length} rows loaded.`);
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

// ── t-SNE coords (optional) ────────────────────────────────────────────────────
async function seedTsneCoords() {
  const tsnePath = join(
    PROJECT_ROOT,
    'data/ilcs/research/tsne_coords.csv'
  );
  let rows: Record<string, string>[];
  try {
    rows = readCsv(tsnePath);
  } catch {
    console.log('  tsne_coords.csv not found — skipping t-SNE seeding.');
    console.log('  Run notebooks/ilcs_tsne_clustering.ipynb first to generate it.');
    return;
  }

  console.log(`Loading t-SNE coords (${rows.length} rows)...`);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      await client.query(
        `INSERT INTO capstone.tsne_coords (id, x, y, cluster, income_decile) VALUES ($1,$2,$3,$4,$5)`,
        [i + 1, num(r.x), num(r.y), num(r.cluster), num(r.income_decile)]
      );
    }
    await client.query('COMMIT');
    console.log(`  Inserted ${rows.length} t-SNE rows.`);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

// ── Correlation matrix ─────────────────────────────────────────────────────────
async function computeAndWriteCorrelations() {
  console.log('Computing correlation matrix...');

  const cols = [
    'household_income_total', 'household_income_source_count', 'household_size',
    'food_purchases_total', 'services_goods_total', 'goods_services_total',
    'amd_3', 'money_family_need_monthly_live', 'money_family_need_monthly_make',
    'drm_in_amd', 'family_debt_amount', 'heating_spend_last_winter_amd',
    'potable_water_hours_day', 'number_of_rooms', 'dwelling_ownership',
    'dwelling_condition_estimate', 'registered_poverty_benefit',
    'share_families_really_vulnerable', 'has_computer', 'household_has_car',
    'dwelling_renovated', 'building_new_house', 'household_sent_money_goods_12m',
    'household_received_money_goods_12m', 'lent_money_12m', 'borrowed_money_12m',
    'humanitarian_assistance_12m', 'has_other_dwelling',
  ];

  // Fetch all data
  const client = await pool.connect();
  let data: number[][] = [];
  try {
    const res = await client.query(`SELECT ${cols.join(',')} FROM capstone.households`);
    data = res.rows.map((row) => cols.map((c) => parseFloat(row[c]) || 0));
  } finally {
    client.release();
  }

  const n = data.length;
  // Compute column means and stds
  const means = cols.map((_, ci) => {
    const sum = data.reduce((acc, row) => acc + row[ci], 0);
    return sum / n;
  });
  const stds = cols.map((_, ci) => {
    const mean = means[ci];
    const variance = data.reduce((acc, row) => acc + (row[ci] - mean) ** 2, 0) / n;
    return Math.sqrt(variance);
  });

  // Compute Pearson correlations
  const matrix: number[][] = [];
  for (let i = 0; i < cols.length; i++) {
    matrix[i] = [];
    for (let j = 0; j < cols.length; j++) {
      if (i === j) {
        matrix[i][j] = 1;
        continue;
      }
      const cov =
        data.reduce((acc, row) => acc + (row[i] - means[i]) * (row[j] - means[j]), 0) / n;
      const corr =
        stds[i] > 0 && stds[j] > 0 ? cov / (stds[i] * stds[j]) : 0;
      matrix[i][j] = Math.round(corr * 10000) / 10000;
    }
  }

  const output = { columns: cols, matrix };
  const outPath = join(PUBLIC_DIR, 'correlations.json');
  writeFileSync(outPath, JSON.stringify(output));
  console.log(`  Correlation matrix (${cols.length}×${cols.length}) written to public/correlations.json`);
}

// ── GeoJSON copy ───────────────────────────────────────────────────────────────
function copyGeoJSON() {
  const src = join(PROJECT_ROOT, 'data/raw/geo/geoBoundaries-ARM-ADM1_simplified.geojson');
  const dst = join(PUBLIC_DIR, 'armenia.geojson');
  try {
    copyFileSync(src, dst);
    console.log('GeoJSON copied to public/armenia.geojson');
  } catch {
    console.warn('  Could not copy GeoJSON — file may not exist at', src);
  }
}

// ── Main ───────────────────────────────────────────────────────────────────────
async function main() {
  console.log('=== Capstone DB Seed ===');
  console.log('DATABASE_URL:', process.env.DATABASE_URL ?? '(not set)');

  try {
    await createSchema();
    await seedHouseholds();
    await seedRegionalPanel();
    await seedFeatureImportance();
    await seedModelMetrics();
    await seedForecastingResults();
    await seedTsneCoords();
    await computeAndWriteCorrelations();
    copyGeoJSON();

    // Verify row counts
    console.log('\n=== Row counts ===');
    for (const table of [
      'households', 'regional_panel', 'feature_importance',
      'model_metrics', 'forecasting_results', 'tsne_coords',
    ]) {
      const rows = await runReturning<{ cnt: number }>(
        `SELECT COUNT(*)::int AS cnt FROM capstone.${table}`
      );
      console.log(`  capstone.${table}: ${rows[0].cnt}`);
    }

    console.log('\nDone!');
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
