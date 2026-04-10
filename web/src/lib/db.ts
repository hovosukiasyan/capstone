import { Pool } from 'pg';
import type {
  Household,
  RegionalRow,
  FeatureImportance,
  ModelMetrics,
  ForecastingResult,
  TsnePoint,
  HouseholdStats,
  DistributionResponse,
  HistogramBucket,
  ScatterPoint,
  ChoroplethRow,
  RankingRow,
  PaginatedResponse,
} from './types';

// ── Connection pool ────────────────────────────────────────────────────────────
// Singleton pool reused across all API calls in the same Node.js process.
let pool: Pool | null = null;

function maskUrl(url: string): string {
  try {
    const u = new URL(url);
    u.password = '***';
    return u.toString().slice(0, 80);
  } catch {
    return url.slice(0, 50) + '…';
  }
}

function getPool(): Pool {
  if (!pool) {
    // Log which env vars are present (masked)
    const envVars = [
      'DATABASE_URL_UNPOOLED', 'DATABASE_URL',
      'POSTGRES_URL', 'POSTGRES_URL_NON_POOLING',
      'NEON_DATABASE_URL',
    ];
    for (const key of envVars) {
      const val = process.env[key];
      console.log(`[db] ${key}: ${val ? maskUrl(val) : 'NOT SET'}`);
    }

    const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
    if (!url) {
      const setVars = envVars.filter((k) => process.env[k]);
      console.error('[db] No DATABASE_URL found. Set vars:', setVars);
      throw new Error(
        `DATABASE_URL env variable is not set. Available DB-related vars: ${setVars.join(', ') || 'none'}`
      );
    }

    console.log('[db] Creating pool with:', maskUrl(url));
    try {
      pool = new Pool({
        connectionString: url,
        max: 10,
        connectionTimeoutMillis: 5000,
        idleTimeoutMillis: 30000,
      });
      console.log('[db] Pool created successfully');
    } catch (err) {
      console.error('[db] Pool creation failed:', err);
      throw err;
    }
  }
  return pool;
}

async function query<T = Record<string, unknown>>(
  sql: string,
  params?: unknown[]
): Promise<T[]> {
  let client;
  try {
    client = await getPool().connect();
  } catch (err) {
    const e = err as Record<string, unknown>;
    console.error('[db] connect() failed:', {
      message: e?.message,
      code: e?.code,
      stack: e?.stack,
    });
    throw err;
  }
  try {
    const res = await client.query(sql, params);
    return res.rows as T[];
  } catch (err) {
    const e = err as Record<string, unknown>;
    console.error('[db] query failed:', {
      sql: sql.slice(0, 120),
      message: e?.message,
      code: e?.code,
      detail: e?.detail,
      hint: e?.hint,
      stack: e?.stack,
    });
    throw err;
  } finally {
    client.release();
  }
}

// ── Household queries ──────────────────────────────────────────────────────────

export async function getHouseholdStats(): Promise<HouseholdStats> {
  const rows = await query<HouseholdStats>(`
    SELECT
      COUNT(*)::int                           AS count,
      AVG(household_income_total)             AS mean_income,
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY household_income_total) AS median_income,
      PERCENTILE_CONT(0.1) WITHIN GROUP (ORDER BY household_income_total) AS p10_income,
      PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY household_income_total) AS p90_income,
      STDDEV(household_income_total)          AS std_income,
      MIN(household_income_total)             AS min_income,
      MAX(household_income_total)             AS max_income
    FROM capstone.households
  `);
  return rows[0];
}

export async function getIncomeByMonth(): Promise<
  { month: number; mean_income: number; count: number }[]
> {
  return query(`
    SELECT
      interview_month AS month,
      AVG(household_income_total)::float AS mean_income,
      COUNT(*)::int AS count
    FROM capstone.households
    GROUP BY interview_month
    ORDER BY interview_month
  `);
}

export async function getHouseholdDistribution(
  column: string,
  bins = 50
): Promise<DistributionResponse> {
  // For monetary columns use log10 bucketing; for others use linear
  const monetaryColumns = new Set([
    'household_income_total', 'food_purchases_total', 'services_goods_total',
    'goods_services_total', 'amd_3', 'money_family_need_monthly_live',
    'money_family_need_monthly_make', 'drm_in_amd', 'family_debt_amount',
    'heating_spend_last_winter_amd',
  ]);
  const binaryColumns = new Set([
    'has_computer', 'has_other_dwelling', 'household_has_car', 'dwelling_renovated',
    'building_new_house', 'household_sent_money_goods_12m',
    'household_received_money_goods_12m', 'lent_money_12m', 'borrowed_money_12m',
    'humanitarian_assistance_12m',
  ]);
  const ordinalColumns = new Set([
    'dwelling_ownership', 'dwelling_condition_estimate', 'registered_poverty_benefit',
    'share_families_really_vulnerable', 'interview_month',
  ]);

  const colType = monetaryColumns.has(column)
    ? 'monetary'
    : binaryColumns.has(column)
    ? 'binary'
    : ordinalColumns.has(column)
    ? 'ordinal'
    : 'count';

  // Stats always
  const statsRows = await query<{
    mean: number; median: number; std: number;
    min: number; max: number; p10: number; p90: number; cnt: number;
  }>(`
    SELECT
      AVG(${column})::float                                          AS mean,
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ${column})::float AS median,
      STDDEV(${column})::float                                       AS std,
      MIN(${column})::float                                          AS min,
      MAX(${column})::float                                          AS max,
      PERCENTILE_CONT(0.1) WITHIN GROUP (ORDER BY ${column})::float AS p10,
      PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY ${column})::float AS p90,
      COUNT(*)::int                                                  AS cnt
    FROM capstone.households
    WHERE ${column} IS NOT NULL
  `);

  const s = statsRows[0];
  const stats = {
    mean: s.mean, median: s.median, std: s.std,
    min: s.min, max: s.max, p10: s.p10, p90: s.p90, count: s.cnt,
  };

  let buckets: HistogramBucket[];

  if (colType === 'binary' || colType === 'ordinal') {
    // Frequency count per value
    const rows = await query<{ val: number; cnt: number }>(`
      SELECT ${column}::int AS val, COUNT(*)::int AS cnt
      FROM capstone.households
      WHERE ${column} IS NOT NULL
      GROUP BY ${column}
      ORDER BY ${column}
    `);
    buckets = rows.map((r) => ({ x0: r.val, x1: r.val + 1, count: r.cnt }));
  } else {
    // Numeric histogram using width_bucket
    const useLog = colType === 'monetary';
    const expr = useLog ? `LOG(NULLIF(${column}, 0))` : column;
    const boundsRows = await query<{ lo: number; hi: number }>(`
      SELECT MIN(${expr})::float AS lo, MAX(${expr})::float AS hi
      FROM capstone.households
      WHERE ${column} > 0
    `);
    const { lo, hi } = boundsRows[0];
    const binCount = bins;
    const rows = await query<{ bucket: number; cnt: number }>(`
      SELECT width_bucket(${expr}, $1::float, $2::float, $3)::int AS bucket,
             COUNT(*)::int AS cnt
      FROM capstone.households
      WHERE ${column} > 0
      GROUP BY bucket
      ORDER BY bucket
    `, [lo, hi, binCount]);

    const step = (hi - lo) / binCount;
    buckets = rows.map((r) => {
      const logX0 = lo + (r.bucket - 1) * step;
      const logX1 = lo + r.bucket * step;
      return {
        x0: useLog ? Math.pow(10, logX0) : logX0,
        x1: useLog ? Math.pow(10, logX1) : logX1,
        count: r.cnt,
      };
    });
  }

  return { bins: buckets, stats, column, columnType: colType };
}

export async function getScatterPoints(
  xCol: string,
  yCol: string,
  colorCol: string,
  pMin = 0,
  pMax = 100,
  limit = 5000
): Promise<ScatterPoint[]> {
  const rows = await query<{ id: number; x: number; y: number; color_value: number }>(`
    WITH bounds AS (
      SELECT
        PERCENTILE_CONT($1 / 100.0) WITHIN GROUP (ORDER BY ${xCol}) AS x_lo,
        PERCENTILE_CONT($2 / 100.0) WITHIN GROUP (ORDER BY ${xCol}) AS x_hi,
        PERCENTILE_CONT($1 / 100.0) WITHIN GROUP (ORDER BY ${yCol}) AS y_lo,
        PERCENTILE_CONT($2 / 100.0) WITHIN GROUP (ORDER BY ${yCol}) AS y_hi
      FROM capstone.households
    )
    SELECT id, ${xCol}::float AS x, ${yCol}::float AS y, ${colorCol}::float AS color_value
    FROM capstone.households, bounds
    WHERE ${xCol} BETWEEN x_lo AND x_hi
      AND ${yCol} BETWEEN y_lo AND y_hi
    LIMIT $3
  `, [pMin, pMax, limit]);
  return rows;
}

export async function getHouseholdList(
  page: number,
  perPage: number,
  sortCol: string,
  sortDir: 'asc' | 'desc',
  incomeMin?: number,
  incomeMax?: number,
  householdSizeMin?: number,
  householdSizeMax?: number
): Promise<PaginatedResponse<Household>> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIdx = 1;

  if (incomeMin !== undefined) {
    conditions.push(`household_income_total >= $${paramIdx++}`);
    params.push(incomeMin);
  }
  if (incomeMax !== undefined) {
    conditions.push(`household_income_total <= $${paramIdx++}`);
    params.push(incomeMax);
  }
  if (householdSizeMin !== undefined) {
    conditions.push(`household_size >= $${paramIdx++}`);
    params.push(householdSizeMin);
  }
  if (householdSizeMax !== undefined) {
    conditions.push(`household_size <= $${paramIdx++}`);
    params.push(householdSizeMax);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const validSortCols = new Set([
    'id', 'household_income_total', 'household_size', 'interview_month',
    'household_income_source_count', 'food_purchases_total',
  ]);
  const safeSort = validSortCols.has(sortCol) ? sortCol : 'id';
  const safeDir = sortDir === 'desc' ? 'DESC' : 'ASC';
  const offset = (page - 1) * perPage;

  const [rows, countRows] = await Promise.all([
    query<Household>(
      `SELECT * FROM capstone.households ${where} ORDER BY ${safeSort} ${safeDir} LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      [...params, perPage, offset]
    ),
    query<{ total: number }>(
      `SELECT COUNT(*)::int AS total FROM capstone.households ${where}`,
      params
    ),
  ]);

  return { rows, total: countRows[0].total, page, per_page: perPage };
}

export async function getTsnePoints(): Promise<TsnePoint[]> {
  return query<TsnePoint>(`
    SELECT t.id, t.x, t.y, t.cluster, t.income_decile,
           h.household_size, h.household_income_total,
           h.household_has_car, h.has_computer
    FROM capstone.tsne_coords t
    JOIN capstone.households h ON h.id = t.id
    ORDER BY t.id
  `);
}

// ── Regional queries ───────────────────────────────────────────────────────────

export async function getChoroplethData(
  indicator: string,
  year: number | 'avg'
): Promise<ChoroplethRow[]> {
  const validIndicators = new Set([
    'poverty_rate', 'extreme_poverty_rate', 'crime_rate_per_100k',
    'hospitals_per_100k', 'beds_per_10k', 'stress_index',
  ]);
  if (!validIndicators.has(indicator)) throw new Error(`Invalid indicator: ${indicator}`);

  if (year === 'avg') {
    return query<ChoroplethRow>(`
      SELECT marz, AVG(${indicator})::float AS value
      FROM capstone.regional_panel
      WHERE ${indicator} IS NOT NULL
      GROUP BY marz
      ORDER BY marz
    `);
  }
  return query<ChoroplethRow>(`
    SELECT marz, AVG(${indicator})::float AS value
    FROM capstone.regional_panel
    WHERE year = $1 AND ${indicator} IS NOT NULL
    GROUP BY marz
    ORDER BY marz
  `, [year]);
}

export async function getRegionalPanel(
  marzes: string[],
  yearFrom: number,
  yearTo: number,
  indicator: string
): Promise<{ marz: string; date: string; year: number; month: number; value: number }[]> {
  const validIndicators = new Set([
    'poverty_rate', 'extreme_poverty_rate', 'crime_rate_per_100k',
    'hospitals_per_100k', 'beds_per_10k', 'stress_index',
  ]);
  if (!validIndicators.has(indicator)) throw new Error(`Invalid indicator: ${indicator}`);

  if (marzes.length === 0) {
    return query(`
      SELECT marz, date, year, month, ${indicator}::float AS value
      FROM capstone.regional_panel
      WHERE year BETWEEN $1 AND $2 AND ${indicator} IS NOT NULL
      ORDER BY marz, date
    `, [yearFrom, yearTo]);
  }

  return query(`
    SELECT marz, date, year, month, ${indicator}::float AS value
    FROM capstone.regional_panel
    WHERE marz = ANY($1) AND year BETWEEN $2 AND $3 AND ${indicator} IS NOT NULL
    ORDER BY marz, date
  `, [marzes, yearFrom, yearTo]);
}

export async function getRegionalRanking(
  indicator: string,
  year: number
): Promise<RankingRow[]> {
  const validIndicators = new Set([
    'poverty_rate', 'extreme_poverty_rate', 'crime_rate_per_100k',
    'hospitals_per_100k', 'beds_per_10k', 'stress_index',
  ]);
  if (!validIndicators.has(indicator)) throw new Error(`Invalid indicator: ${indicator}`);

  const rows = await query<{
    marz: string; value: number | null; prior_year_value: number | null;
  }>(`
    SELECT
      c.marz,
      c.value,
      p.value AS prior_year_value
    FROM (
      SELECT marz, AVG(${indicator})::float AS value
      FROM capstone.regional_panel WHERE year = $1 GROUP BY marz
    ) c
    LEFT JOIN (
      SELECT marz, AVG(${indicator})::float AS value
      FROM capstone.regional_panel WHERE year = $2 GROUP BY marz
    ) p ON c.marz = p.marz
    ORDER BY c.value DESC NULLS LAST
  `, [year, year - 1]);

  return rows.map((r, i) => ({
    ...r,
    rank: i + 1,
    change: r.prior_year_value != null && r.value != null
      ? r.value - r.prior_year_value
      : null,
  }));
}

export async function getRegionalYears(): Promise<number[]> {
  const rows = await query<{ year: number }>(
    'SELECT DISTINCT year FROM capstone.regional_panel ORDER BY year'
  );
  return rows.map((r) => r.year);
}

// ── Model queries ─────────────────────────────────────────────────────────────

export async function getModelMetrics(): Promise<ModelMetrics[]> {
  return query<ModelMetrics>(
    'SELECT * FROM capstone.model_metrics ORDER BY r2 DESC'
  );
}

export async function getFeatureImportance(
  model: string,
  topN = 28
): Promise<FeatureImportance[]> {
  const valid = new Set(['gbm', 'rf', 'et', 'ridge', 'lasso']);
  if (!valid.has(model)) throw new Error(`Invalid model: ${model}`);
  return query<FeatureImportance>(
    `SELECT model, feature, importance::float
     FROM capstone.feature_importance
     WHERE model = $1
     ORDER BY ABS(importance) DESC
     LIMIT $2`,
    [model, topN]
  );
}

export async function getForecastingResults(
  source: string
): Promise<ForecastingResult[]> {
  const valid = new Set([
    'poverty', 'stress', 'augmentation_baseline', 'augmentation_nn',
    'poverty_nn_activation', 'poverty_nn_layer',
  ]);
  if (!valid.has(source)) throw new Error(`Invalid source: ${source}`);
  return query<ForecastingResult>(
    `SELECT source, model, frequency, r2::float, mae::float
     FROM capstone.forecasting_results
     WHERE source = $1
     ORDER BY COALESCE(r2, -999) DESC`,
    [source]
  );
}
