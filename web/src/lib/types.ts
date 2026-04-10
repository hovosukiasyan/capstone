// Core data types for the Armenia Poverty Prediction visualization app

export interface Household {
  id: number;
  interview_month: number;
  household_size: number;
  dwelling_ownership: number;
  number_of_rooms: number;
  has_computer: number;
  has_other_dwelling: number;
  household_has_car: number;
  potable_water_hours_day: number;
  heating_spend_last_winter_amd: number;
  dwelling_condition_estimate: number;
  dwelling_renovated: number;
  building_new_house: number;
  household_sent_money_goods_12m: number;
  household_received_money_goods_12m: number;
  lent_money_12m: number;
  family_debt_amount: number;
  borrowed_money_12m: number;
  registered_poverty_benefit: number;
  share_families_really_vulnerable: number;
  humanitarian_assistance_12m: number;
  money_family_need_monthly_live: number;
  drm_in_amd: number;
  money_family_need_monthly_make: number;
  amd_3: number;
  household_income_total: number;
  household_income_source_count: number;
  food_purchases_total: number;
  services_goods_total: number;
  goods_services_total: number;
  log_income: number;
}

export interface RegionalRow {
  id: number;
  marz: string;
  date: string;
  year: number;
  month: number;
  poverty_rate: number | null;
  extreme_poverty_rate: number | null;
  non_poor_rate: number | null;
  population: number | null;
  crime_total: number | null;
  crime_selected_total: number | null;
  crime_rate_per_100k: number | null;
  crime_selected_rate_per_100k: number | null;
  hospitals: number | null;
  hospitals_per_100k: number | null;
  beds: number | null;
  beds_per_10k: number | null;
  stress_index: number | null;
}

export interface FeatureImportance {
  model: string;
  feature: string;
  importance: number;
}

export interface ModelMetrics {
  model: string;
  r2: number;
  mae: number;
  rmse: number;
  is_bayesian_optimized: number;
}

export interface ForecastingResult {
  source: string;
  model: string;
  frequency: string | null;
  r2: number | null;
  mae: number | null;
}

export interface TsnePoint {
  id: number;
  x: number;
  y: number;
  cluster: number;
  income_decile: number;
  household_size: number;
  household_income_total: number;
  household_has_car: number;
  has_computer: number;
}

// API response types
export interface HistogramBucket {
  x0: number;
  x1: number;
  count: number;
}

export interface DistributionStats {
  mean: number;
  median: number;
  std: number;
  min: number;
  max: number;
  p10: number;
  p90: number;
  count: number;
}

export interface DistributionResponse {
  bins: HistogramBucket[];
  stats: DistributionStats;
  column: string;
  columnType: 'monetary' | 'binary' | 'ordinal' | 'count';
}

export interface ScatterPoint {
  id: number;
  x: number;
  y: number;
  color_value: number;
}

export interface ChoroplethRow {
  marz: string;
  value: number | null;
}

export interface RankingRow {
  marz: string;
  value: number | null;
  prior_year_value: number | null;
  rank: number;
  change: number | null;
}

export interface HouseholdStats {
  count: number;
  mean_income: number;
  median_income: number;
  p10_income: number;
  p90_income: number;
  std_income: number;
  min_income: number;
  max_income: number;
}

export interface PaginatedResponse<T> {
  rows: T[];
  total: number;
  page: number;
  per_page: number;
}

// Column metadata types
export interface ColumnMeta {
  key: keyof Household;
  label: string;
  type: 'monetary' | 'binary' | 'ordinal' | 'count' | 'continuous';
  description: string;
  unit?: string;
}
