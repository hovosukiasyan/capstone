import type { ColumnMeta } from './types';

// ── Marz (region) names ──────────────────────────────────────────────────────
export const MARZ_NAMES = [
  'Yerevan',
  'Aragatsotn',
  'Ararat',
  'Armavir',
  'Gegharkunik',
  'Kotayk',
  'Lori',
  'Shirak',
  'Syunik',
  'Tavush',
  'Vayots Dzor',
] as const;

export type MarzName = (typeof MARZ_NAMES)[number];

// Canon map for GeoJSON shapeName normalization (same as streamlit_map.py)
export const MARZ_CANON: Record<string, string> = {
  Gegarkunik: 'Gegharkunik',
  Gegharkunik: 'Gegharkunik',
  'Yerevan city': 'Yerevan',
  'City Yerevan': 'Yerevan',
};

// ── Model display names ──────────────────────────────────────────────────────
export const MODEL_LABELS: Record<string, string> = {
  gbm: 'Gradient Boosting',
  rf: 'Random Forest',
  et: 'Extra Trees',
  ridge: 'Ridge Regression',
  lasso: 'Lasso Regression',
};

export const MODEL_COLORS: Record<string, string> = {
  gbm: '#ef4444',
  rf: '#3b82f6',
  et: '#10b981',
  ridge: '#f59e0b',
  lasso: '#8b5cf6',
};

// ── Binary columns (1=Yes, 2=No encoding) ───────────────────────────────────
export const BINARY_1_YES_2_NO_COLUMNS = new Set([
  'has_computer',
  'has_other_dwelling',
  'household_has_car',
  'dwelling_renovated',
  'building_new_house',
  'household_sent_money_goods_12m',
  'household_received_money_goods_12m',
  'lent_money_12m',
  'borrowed_money_12m',
  'humanitarian_assistance_12m',
]);

// ── Ordinal column value labels ──────────────────────────────────────────────
export const ORDINAL_LABELS: Record<string, Record<number, string>> = {
  dwelling_ownership: {
    1: 'Owned outright',
    2: 'Rented',
    3: 'Provided free',
    4: 'Other owned',
    5: 'Other',
  },
  dwelling_condition_estimate: {
    1: 'Excellent',
    2: 'Good',
    3: 'Fair',
    4: 'Poor',
    5: 'Very poor',
  },
  registered_poverty_benefit: {
    1: 'Level 1 (highest)',
    2: 'Level 2',
    3: 'Level 3',
    4: 'Level 4 / None',
  },
  share_families_really_vulnerable: {
    1: 'Very low',
    2: 'Low',
    3: 'Medium',
    4: 'High',
    5: 'Very high',
    6: 'Extreme',
  },
};

// ── Household column metadata ─────────────────────────────────────────────────
export const HOUSEHOLD_COLUMNS: ColumnMeta[] = [
  {
    key: 'household_income_total',
    label: 'Household Income',
    type: 'monetary',
    description: 'Total household income (target variable)',
    unit: 'AMD',
  },
  {
    key: 'household_income_source_count',
    label: 'Income Sources',
    type: 'count',
    description: 'Number of distinct income sources',
  },
  {
    key: 'household_size',
    label: 'Household Size',
    type: 'count',
    description: 'Number of household members',
  },
  {
    key: 'food_purchases_total',
    label: 'Food Purchases',
    type: 'monetary',
    description: 'Total food expenditure',
    unit: 'AMD',
  },
  {
    key: 'services_goods_total',
    label: 'Services & Goods',
    type: 'monetary',
    description: 'Total services and goods spending',
    unit: 'AMD',
  },
  {
    key: 'goods_services_total',
    label: 'Goods & Services (Alt)',
    type: 'monetary',
    description: 'Alternative aggregate spending measure',
    unit: 'AMD',
  },
  {
    key: 'amd_3',
    label: 'Subjective Min. Income',
    type: 'monetary',
    description: 'Perceived minimum income needed to make ends meet',
    unit: 'AMD',
  },
  {
    key: 'money_family_need_monthly_live',
    label: 'Min. for Survival',
    type: 'monetary',
    description: 'Minimum monthly income for survival',
    unit: 'AMD',
  },
  {
    key: 'money_family_need_monthly_make',
    label: 'Income to Make Ends Meet',
    type: 'monetary',
    description: 'Income needed to make ends meet',
    unit: 'AMD',
  },
  {
    key: 'drm_in_amd',
    label: 'Regular Income (DRM)',
    type: 'monetary',
    description: 'Declared regular monthly income',
    unit: 'AMD',
  },
  {
    key: 'family_debt_amount',
    label: 'Family Debt',
    type: 'monetary',
    description: 'Total household debt',
    unit: 'AMD',
  },
  {
    key: 'heating_spend_last_winter_amd',
    label: 'Winter Heating Cost',
    type: 'monetary',
    description: 'Heating expenditure last winter',
    unit: 'AMD',
  },
  {
    key: 'potable_water_hours_day',
    label: 'Water Access (hrs/day)',
    type: 'continuous',
    description: 'Hours of potable water per day',
  },
  {
    key: 'number_of_rooms',
    label: 'Number of Rooms',
    type: 'count',
    description: 'Rooms in dwelling',
  },
  {
    key: 'dwelling_ownership',
    label: 'Dwelling Ownership',
    type: 'ordinal',
    description: 'Type of dwelling ownership',
  },
  {
    key: 'dwelling_condition_estimate',
    label: 'Dwelling Condition',
    type: 'ordinal',
    description: 'Estimated dwelling condition (1=excellent, 5=very poor)',
  },
  {
    key: 'registered_poverty_benefit',
    label: 'Poverty Benefit Level',
    type: 'ordinal',
    description: 'Official poverty assistance level received',
  },
  {
    key: 'share_families_really_vulnerable',
    label: 'Vulnerability Score',
    type: 'ordinal',
    description: 'Self-assessed vulnerability level',
  },
  {
    key: 'has_computer',
    label: 'Has Computer',
    type: 'binary',
    description: 'Household owns a computer',
  },
  {
    key: 'household_has_car',
    label: 'Has Car',
    type: 'binary',
    description: 'Household owns a car',
  },
  {
    key: 'dwelling_renovated',
    label: 'Recently Renovated',
    type: 'binary',
    description: 'Dwelling was recently renovated',
  },
  {
    key: 'building_new_house',
    label: 'Building New House',
    type: 'binary',
    description: 'Household is building or renovating',
  },
  {
    key: 'household_sent_money_goods_12m',
    label: 'Sent Remittances',
    type: 'binary',
    description: 'Sent money or goods abroad in last 12 months',
  },
  {
    key: 'household_received_money_goods_12m',
    label: 'Received Remittances',
    type: 'binary',
    description: 'Received money or goods from abroad in last 12 months',
  },
  {
    key: 'lent_money_12m',
    label: 'Lent Money',
    type: 'binary',
    description: 'Lent money in last 12 months',
  },
  {
    key: 'borrowed_money_12m',
    label: 'Borrowed Money',
    type: 'binary',
    description: 'Borrowed money in last 12 months',
  },
  {
    key: 'humanitarian_assistance_12m',
    label: 'Got Humanitarian Aid',
    type: 'binary',
    description: 'Received humanitarian assistance in last 12 months',
  },
  {
    key: 'has_other_dwelling',
    label: 'Has Other Dwelling',
    type: 'binary',
    description: 'Owns a secondary property',
  },
  {
    key: 'interview_month',
    label: 'Interview Month',
    type: 'ordinal',
    description: 'Month survey was conducted (1=Jan, 12=Dec)',
  },
];

export const HOUSEHOLD_COLUMN_MAP = new Map(
  HOUSEHOLD_COLUMNS.map((c) => [c.key, c])
);

// ── Regional indicators ──────────────────────────────────────────────────────
export const REGIONAL_INDICATORS = [
  { key: 'poverty_rate', label: 'Poverty Rate (%)', colorScheme: 'warm' },
  { key: 'extreme_poverty_rate', label: 'Extreme Poverty Rate (%)', colorScheme: 'warm' },
  { key: 'crime_rate_per_100k', label: 'Crime Rate (per 100k)', colorScheme: 'warm' },
  { key: 'hospitals_per_100k', label: 'Hospitals (per 100k)', colorScheme: 'cool' },
  { key: 'beds_per_10k', label: 'Hospital Beds (per 10k)', colorScheme: 'cool' },
  { key: 'stress_index', label: 'Stress Index (composite)', colorScheme: 'warm' },
] as const;

export type RegionalIndicatorKey = (typeof REGIONAL_INDICATORS)[number]['key'];

// ── Month labels ─────────────────────────────────────────────────────────────
export const MONTH_LABELS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

// ── AMD formatting ───────────────────────────────────────────────────────────
export const AMD_USD_RATE = 410; // approximate
