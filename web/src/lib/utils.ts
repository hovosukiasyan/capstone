import { MARZ_CANON, BINARY_1_YES_2_NO_COLUMNS, ORDINAL_LABELS } from './constants';

// ── AMD currency formatting ───────────────────────────────────────────────────
export function formatAMD(value: number, compact = false): string {
  if (compact) {
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M ֏`;
    if (value >= 1_000) return `${(value / 1_000).toFixed(0)}K ֏`;
    return `${value.toFixed(0)} ֏`;
  }
  return new Intl.NumberFormat('hy-AM', {
    style: 'currency',
    currency: 'AMD',
    maximumFractionDigits: 0,
  }).format(value);
}

// ── Decode binary/ordinal column values ───────────────────────────────────────
export function decodeLabel(column: string, value: number): string {
  if (BINARY_1_YES_2_NO_COLUMNS.has(column)) {
    return value === 1 ? 'Yes' : value === 2 ? 'No' : String(value);
  }
  if (ORDINAL_LABELS[column]) {
    return ORDINAL_LABELS[column][value] ?? String(value);
  }
  return String(value);
}

// ── Marz name normalization (matches streamlit_map.py exactly) ────────────────
export function normalizeMarzName(name: string): string {
  if (!name) return name;
  let s = name.trim().replace(/\s+/g, ' ');
  s = MARZ_CANON[s] ?? s;

  let sLower = s.toLowerCase();
  sLower = sLower.replace(' marz', '').replace(' city', '').replace('city ', '').trim();
  const normalized = sLower
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

  if (normalized.toLowerCase() === 'yerevan') return 'Yerevan';
  return normalized;
}

// ── Number helpers ────────────────────────────────────────────────────────────
export function logTransform(value: number): number {
  return value > 0 ? Math.log10(value) : 0;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

// ── Shared chart tooltip styles ──────────────────────────────────────────────
export const CHART_TOOLTIP_CONTENT_STYLE = {
  background: '#1e293b',
  border: 'none',
  borderRadius: 8,
  fontSize: 12,
  color: '#f1f5f9',
};

export const CHART_TOOLTIP_LABEL_STYLE = {
  color: '#cbd5e1',
};

export const CHART_TOOLTIP_ITEM_STYLE = {
  color: '#f8fafc',
};

// ── Color scale helpers ───────────────────────────────────────────────────────
/**
 * Map a normalized [0,1] value to a warm red scale for "bad" indicators
 * and a blue scale for "good" indicators (hospitals, beds).
 */
export function getIndicatorColor(
  value: number,
  min: number,
  max: number,
  scheme: 'warm' | 'cool' = 'warm'
): string {
  if (max === min) return scheme === 'warm' ? '#fee5d9' : '#deebf7';
  const t = (value - min) / (max - min);
  if (scheme === 'warm') {
    // White → dark red
    const r = Math.round(255 - t * 180);
    const g = Math.round(245 - t * 210);
    const b = Math.round(240 - t * 220);
    return `rgb(${r},${g},${b})`;
  } else {
    // White → dark blue
    const r = Math.round(255 - t * 210);
    const g = Math.round(245 - t * 160);
    const b = Math.round(240 - t * 40);
    return `rgb(${r},${g},${b})`;
  }
}

// ── Month labels ──────────────────────────────────────────────────────────────
export const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

export function monthName(month: number): string {
  return MONTH_NAMES[month - 1] ?? String(month);
}

// ── Percent formatting ────────────────────────────────────────────────────────
export function formatPct(value: number, decimals = 1): string {
  return `${value.toFixed(decimals)}%`;
}

// ── Change indicator ──────────────────────────────────────────────────────────
export function changeArrow(change: number | null): string {
  if (change === null) return '—';
  if (change > 0.01) return '↑';
  if (change < -0.01) return '↓';
  return '→';
}
