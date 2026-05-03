import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type {
  Household,
  RegionalRow,
  FeatureImportance,
  ModelMetrics,
  TsnePoint,
  HouseholdStats,
  DistributionResponse,
  HistogramBucket,
  ScatterPoint,
  ChoroplethRow,
  RankingRow,
  PaginatedResponse,
} from './types';

const PROJECT_ROOT = join(process.cwd(), '..');

// ── CSV parsing ────────────────────────────────────────────────────────────────
function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i += 1; }
      else inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      values.push(current); current = '';
    } else {
      current += char;
    }
  }
  values.push(current);
  return values;
}

function readCsv(filePath: string): Record<string, string>[] {
  if (!existsSync(filePath)) throw new Error(`CSV not found: ${filePath}`);
  const text = readFileSync(filePath, 'utf8').trim();
  const [headerLine, ...lines] = text.split(/\r?\n/);
  const headers = parseCsvLine(headerLine);
  return lines.filter(Boolean).map((line) => {
    const values = parseCsvLine(line);
    return Object.fromEntries(headers.map((h, i) => [h, values[i] ?? '']));
  });
}

function num(v: string | undefined): number | null {
  if (!v || v === '' || v.toLowerCase() === 'na' || v.toLowerCase() === 'nan') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function ri(v: string | undefined): number | null {
  const n = num(v);
  return n === null ? null : Math.round(n);
}

function normalizeMarz(name: string): string {
  if (!name) return name;
  const CANON: Record<string, string> = {
    Gegarkunik: 'Gegharkunik',
    Gegharkunik: 'Gegharkunik',
    'Yerevan city': 'Yerevan',
    'City Yerevan': 'Yerevan',
  };
  let s = name.trim().replace(/\s+/g, ' ');
  s = CANON[s] ?? s;
  const sLower = s.toLowerCase().replace(' marz', '').replace(' city', '').replace('city ', '').trim();
  const normalized = sLower.split(' ').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  if (normalized.toLowerCase() === 'yerevan') return 'Yerevan';
  return normalized;
}

// ── Cached singletons ─────────────────────────────────────────────────────────
let _households: Household[] | null = null;
let _panel: RegionalRow[] | null = null;

function loadHouseholds(): Household[] {
  if (_households) return _households;
  const csvPath = join(PROJECT_ROOT, 'data/ilcs/research/ml_households_research_columns_imputed.csv');
  const rows = readCsv(csvPath);
  _households = rows.map((r, i) => {
    const income = num(r.household_income_total);
    const logIncome = income && income > 0 ? Math.log10(income) : null;
    return {
      id: i + 1,
      interview_month: ri(r.interview_month) ?? null,
      household_size: ri(r.household_size) ?? null,
      dwelling_ownership: ri(r.dwelling_ownership) ?? null,
      number_of_rooms: ri(r.number_of_rooms) ?? null,
      has_computer: ri(r.has_computer) ?? null,
      has_other_dwelling: ri(r.has_other_dwelling) ?? null,
      household_has_car: ri(r.household_has_car) ?? null,
      potable_water_hours_day: num(r.potable_water_hours_day) ?? null,
      heating_spend_last_winter_amd: num(r.heating_spend_last_winter_amd) ?? null,
      dwelling_condition_estimate: ri(r.dwelling_condition_estimate) ?? null,
      dwelling_renovated: ri(r.dwelling_renovated) ?? null,
      building_new_house: ri(r.building_new_house) ?? null,
      household_sent_money_goods_12m: ri(r.household_sent_money_goods_12m) ?? null,
      household_received_money_goods_12m: ri(r.household_received_money_goods_12m) ?? null,
      lent_money_12m: ri(r.lent_money_12m) ?? null,
      family_debt_amount: num(r.family_debt_amount) ?? null,
      borrowed_money_12m: ri(r.borrowed_money_12m) ?? null,
      registered_poverty_benefit: ri(r.registered_poverty_benefit) ?? null,
      share_families_really_vulnerable: ri(r.share_families_really_vulnerable) ?? null,
      humanitarian_assistance_12m: ri(r.humanitarian_assistance_12m) ?? null,
      money_family_need_monthly_live: num(r.money_family_need_monthly_live) ?? null,
      drm_in_amd: num(r.drm_in_amd) ?? null,
      money_family_need_monthly_make: num(r.money_family_need_monthly_make) ?? null,
      amd_3: num(r.amd_3) ?? null,
      household_income_total: income ?? null,
      household_income_source_count: ri(r.household_income_source_count) ?? null,
      food_purchases_total: num(r.food_purchases_total) ?? null,
      services_goods_total: num(r.services_goods_total) ?? null,
      goods_services_total: num(r.goods_services_total) ?? null,
      log_income: logIncome ?? null,
    } as unknown as Household;
  });
  return _households;
}

function loadPanel(): RegionalRow[] {
  if (_panel) return _panel;
  const monthlyPath = join(PROJECT_ROOT, 'data/processed/panel/marz_monthly_panel_augmented.csv');
  const yearlyPath = join(PROJECT_ROOT, 'data/processed/panel/marz_year_panel_common_with_stress.csv');

  const yearlyRows = readCsv(yearlyPath);
  const stressMap = new Map<string, number | null>();
  for (const r of yearlyRows) {
    stressMap.set(`${normalizeMarz(r.marz)}::${r.year}`, num(r.stress_index));
  }

  let id = 1;
  _panel = readCsv(monthlyPath).map((r) => {
    const marz = normalizeMarz(r.marz);
    const year = ri(r.year) ?? 0;
    return {
      id: id++,
      marz,
      date: r.date,
      year,
      month: ri(r.month) ?? 0,
      poverty_rate: num(r.poverty_rate),
      extreme_poverty_rate: num(r.extreme_poverty_rate),
      non_poor_rate: num(r.non_poor_rate),
      population: num(r.population),
      crime_total: num(r.crime_total),
      crime_selected_total: num(r.crime_selected_total),
      crime_rate_per_100k: num(r.crime_rate_per_100k),
      crime_selected_rate_per_100k: num(r.crime_selected_rate_per_100k),
      hospitals: num(r.hospitals),
      hospitals_per_100k: num(r.hospitals_per_100k),
      beds: num(r.beds),
      beds_per_10k: num(r.beds_per_10k),
      stress_index: stressMap.get(`${marz}::${year}`) ?? null,
    };
  });
  return _panel;
}

// ── Stats helpers ─────────────────────────────────────────────────────────────
function sortedNums(arr: number[]): number[] {
  return [...arr].sort((a, b) => a - b);
}

function pctile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = p * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (idx - lo) * (sorted[hi] - sorted[lo]);
}

function avg(arr: number[]): number {
  return arr.length === 0 ? 0 : arr.reduce((a, b) => a + b, 0) / arr.length;
}

function stddev(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = avg(arr);
  return Math.sqrt(arr.reduce((s, x) => s + (x - m) ** 2, 0) / arr.length);
}

// Replicates PostgreSQL width_bucket: 1-based bucket, clamped to [1, count]
function widthBucket(val: number, lo: number, hi: number, count: number): number {
  if (hi <= lo) return 1;
  const b = Math.floor(((val - lo) / (hi - lo)) * count) + 1;
  return Math.min(Math.max(b, 1), count);
}

// ── Household functions ───────────────────────────────────────────────────────
export async function getHouseholdStats(): Promise<HouseholdStats> {
  const hh = loadHouseholds();
  const incomes = hh.map((h) => h.household_income_total).filter((v): v is number => v !== null);
  const sorted = sortedNums(incomes);
  return {
    count: hh.length,
    mean_income: avg(incomes),
    median_income: pctile(sorted, 0.5),
    p10_income: pctile(sorted, 0.1),
    p90_income: pctile(sorted, 0.9),
    std_income: stddev(incomes),
    min_income: sorted[0] ?? 0,
    max_income: sorted[sorted.length - 1] ?? 0,
  };
}

export async function getHouseholdDistribution(
  column: string,
  bins = 50
): Promise<DistributionResponse> {
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

  const colType = monetaryColumns.has(column) ? 'monetary'
    : binaryColumns.has(column) ? 'binary'
    : ordinalColumns.has(column) ? 'ordinal'
    : 'count';

  const col = column as keyof Household;
  const hh = loadHouseholds();
  const values = hh.map((h) => h[col] as number | null).filter((v): v is number => v !== null);
  const sorted = sortedNums(values);

  const stats = {
    mean: avg(values),
    median: pctile(sorted, 0.5),
    std: stddev(values),
    min: sorted[0] ?? 0,
    max: sorted[sorted.length - 1] ?? 0,
    p10: pctile(sorted, 0.1),
    p90: pctile(sorted, 0.9),
    count: values.length,
  };

  let buckets: HistogramBucket[];

  if (colType === 'binary' || colType === 'ordinal') {
    const freq = new Map<number, number>();
    for (const v of values) freq.set(v, (freq.get(v) ?? 0) + 1);
    buckets = [...freq.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([val, count]) => ({ x0: val, x1: val + 1, count }));
  } else {
    const useLog = colType === 'monetary';
    const posValues = values.filter((v) => v > 0);
    const transformed = useLog ? posValues.map((v) => Math.log10(v)) : posValues;
    if (transformed.length === 0) return { bins: [], stats, column, columnType: colType };

    const lo = Math.min(...transformed);
    const hi = Math.max(...transformed);
    const step = (hi - lo) / bins;
    const counts = new Array<number>(bins).fill(0);
    for (const v of transformed) {
      counts[widthBucket(v, lo, hi, bins) - 1] += 1;
    }

    buckets = counts
      .map((count, i) => ({
        x0: useLog ? Math.pow(10, lo + i * step) : lo + i * step,
        x1: useLog ? Math.pow(10, lo + (i + 1) * step) : lo + (i + 1) * step,
        count,
      }))
      .filter((b) => b.count > 0);
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
  const hh = loadHouseholds();
  const xC = xCol as keyof Household;
  const yC = yCol as keyof Household;
  const colorC = colorCol as keyof Household;

  const xVals = sortedNums(hh.map((h) => h[xC] as number | null).filter((v): v is number => v !== null));
  const yVals = sortedNums(hh.map((h) => h[yC] as number | null).filter((v): v is number => v !== null));
  const xLo = pctile(xVals, pMin / 100);
  const xHi = pctile(xVals, pMax / 100);
  const yLo = pctile(yVals, pMin / 100);
  const yHi = pctile(yVals, pMax / 100);

  return hh
    .filter((h) => {
      const x = h[xC] as number | null;
      const y = h[yC] as number | null;
      return x !== null && y !== null && x >= xLo && x <= xHi && y >= yLo && y <= yHi;
    })
    .slice(0, limit)
    .map((h) => ({
      id: h.id,
      x: h[xC] as number,
      y: h[yC] as number,
      color_value: h[colorC] as number,
    }));
}

export async function getHouseholdList(
  page: number,
  perPage: number,
  sortCol: string,
  sortDir: 'asc' | 'desc',
  incomeMin?: number,
  incomeMax?: number,
  sizeMin?: number,
  sizeMax?: number,
  hasComputer?: number,
  hasCar?: number,
  benefitLevel?: number,
  interviewMonth?: number
): Promise<PaginatedResponse<Household>> {
  let rows = loadHouseholds();

  if (incomeMin !== undefined) rows = rows.filter((h) => (h.household_income_total ?? 0) >= incomeMin);
  if (incomeMax !== undefined) rows = rows.filter((h) => (h.household_income_total ?? 0) <= incomeMax);
  if (sizeMin !== undefined)   rows = rows.filter((h) => (h.household_size ?? 0) >= sizeMin);
  if (sizeMax !== undefined)   rows = rows.filter((h) => (h.household_size ?? 0) <= sizeMax);
  if (hasComputer !== undefined) rows = rows.filter((h) => h.has_computer === hasComputer);
  if (hasCar !== undefined)    rows = rows.filter((h) => h.household_has_car === hasCar);
  if (benefitLevel !== undefined) rows = rows.filter((h) => h.registered_poverty_benefit === benefitLevel);
  if (interviewMonth !== undefined) rows = rows.filter((h) => h.interview_month === interviewMonth);

  const validSortCols = new Set([
    'id', 'household_income_total', 'household_size', 'interview_month',
    'household_income_source_count', 'food_purchases_total',
  ]);
  const safeSort = (validSortCols.has(sortCol) ? sortCol : 'id') as keyof Household;
  rows = [...rows].sort((a, b) => {
    const av = (a[safeSort] ?? 0) as number;
    const bv = (b[safeSort] ?? 0) as number;
    return sortDir === 'desc' ? bv - av : av - bv;
  });

  const total = rows.length;
  const offset = (page - 1) * perPage;
  return { rows: rows.slice(offset, offset + perPage), total, page, per_page: perPage };
}

export async function getTsnePoints(): Promise<TsnePoint[]> {
  const csvPath = join(PROJECT_ROOT, 'data/ilcs/research/tsne_coords.csv');
  const rows = readCsv(csvPath);
  const hh = loadHouseholds();
  const hhMap = new Map(hh.map((h) => [h.id, h]));

  return rows.map((r, i) => {
    const id = i + 1;
    const h = hhMap.get(id);
    return {
      id,
      x: num(r.x) ?? 0,
      y: num(r.y) ?? 0,
      cluster: ri(r.cluster) ?? 0,
      income_decile: ri(r.income_decile) ?? 0,
      household_size: h?.household_size ?? null,
      household_income_total: h?.household_income_total ?? null,
      household_has_car: h?.household_has_car ?? null,
      has_computer: h?.has_computer ?? null,
    } as TsnePoint;
  });
}

// ── Regional functions ────────────────────────────────────────────────────────
const VALID_INDICATORS = new Set([
  'poverty_rate', 'extreme_poverty_rate', 'crime_rate_per_100k',
  'hospitals_per_100k', 'beds_per_10k', 'stress_index',
]);

export async function getChoroplethData(
  indicator: string,
  year: number | 'avg'
): Promise<ChoroplethRow[]> {
  if (!VALID_INDICATORS.has(indicator)) throw new Error(`Invalid indicator: ${indicator}`);
  const col = indicator as keyof RegionalRow;
  const panel = loadPanel();
  const filtered = year === 'avg'
    ? panel.filter((r) => r[col] !== null)
    : panel.filter((r) => r.year === year && r[col] !== null);

  const groups = new Map<string, number[]>();
  for (const r of filtered) {
    if (!groups.has(r.marz)) groups.set(r.marz, []);
    groups.get(r.marz)!.push(r[col] as number);
  }

  return [...groups.entries()]
    .map(([marz, vals]) => ({ marz, value: avg(vals) }))
    .sort((a, b) => a.marz.localeCompare(b.marz));
}

export async function getRegionalPanel(
  marzes: string[],
  yearFrom: number,
  yearTo: number,
  indicator: string
): Promise<{ marz: string; date: string; year: number; month: number; value: number }[]> {
  if (!VALID_INDICATORS.has(indicator)) throw new Error(`Invalid indicator: ${indicator}`);
  const col = indicator as keyof RegionalRow;
  return loadPanel()
    .filter((r) =>
      r.year >= yearFrom && r.year <= yearTo &&
      r[col] !== null &&
      (marzes.length === 0 || marzes.includes(r.marz))
    )
    .map((r) => ({ marz: r.marz, date: r.date, year: r.year, month: r.month, value: r[col] as number }))
    .sort((a, b) => a.marz.localeCompare(b.marz) || a.date.localeCompare(b.date));
}

export async function getRegionalRanking(
  indicator: string,
  year: number
): Promise<RankingRow[]> {
  if (!VALID_INDICATORS.has(indicator)) throw new Error(`Invalid indicator: ${indicator}`);
  const col = indicator as keyof RegionalRow;
  const panel = loadPanel();

  const avgByYear = (yr: number) => {
    const groups = new Map<string, number[]>();
    for (const r of panel) {
      if (r.year === yr && r[col] !== null) {
        if (!groups.has(r.marz)) groups.set(r.marz, []);
        groups.get(r.marz)!.push(r[col] as number);
      }
    }
    return new Map([...groups.entries()].map(([m, vals]) => [m, avg(vals)]));
  };

  const current = avgByYear(year);
  const prior = avgByYear(year - 1);

  return [...current.entries()]
    .map(([marz, value]) => ({
      marz,
      value,
      prior_year_value: prior.get(marz) ?? null,
      rank: 0,
      change: prior.has(marz) ? value - prior.get(marz)! : null,
    }))
    .sort((a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity))
    .map((r, i) => ({ ...r, rank: i + 1 }));
}

export async function getRegionalYears(): Promise<number[]> {
  const years = [...new Set(loadPanel().map((r) => r.year))].sort((a, b) => a - b);
  return years;
}

// ── Model functions ───────────────────────────────────────────────────────────
export async function getModelMetrics(): Promise<ModelMetrics[]> {
  return [
    { model: 'gbm',   r2: 0.3563, mae: 82152,  rmse: 162784, is_bayesian_optimized: 1 },
    { model: 'rf',    r2: 0.3398, mae: 85475,  rmse: 165603, is_bayesian_optimized: 1 },
    { model: 'et',    r2: 0.3316, mae: 87681,  rmse: 167979, is_bayesian_optimized: 1 },
    { model: 'ridge', r2: 0.3153, mae: 91183,  rmse: 167894, is_bayesian_optimized: 0 },
    { model: 'lasso', r2: 0.3154, mae: 91186,  rmse: 167879, is_bayesian_optimized: 0 },
  ];
}

export async function getFeatureImportance(
  model: string,
  topN = 28
): Promise<FeatureImportance[]> {
  const fileMap: Record<string, string> = {
    gbm:   'feature_importance_gbm.csv',
    rf:    'feature_importance_rf.csv',
    et:    'feature_importance_extra_trees.csv',
    ridge: 'feature_importance_ridge.csv',
    lasso: 'feature_importance_lasso.csv',
  };
  const fileName = fileMap[model];
  if (!fileName) throw new Error(`Invalid model: ${model}`);

  const csvPath = join(PROJECT_ROOT, 'data/ilcs/research/feature_importance', fileName);
  return readCsv(csvPath)
    .map((r) => ({ model, feature: r.feature ?? '', importance: num(r.importance) ?? 0 }))
    .sort((a, b) => Math.abs(b.importance) - Math.abs(a.importance))
    .slice(0, topN);
}
