'use client';

import { useState, useMemo } from 'react';
import useSWR from 'swr';
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { apiFetcher, getErrorMessage } from '@/lib/fetcher';
import ChoroplethMap from '@/components/charts/ChoroplethMap';
import {
  CHART_TOOLTIP_CONTENT_STYLE,
  CHART_TOOLTIP_LABEL_STYLE,
  CHART_TOOLTIP_ITEM_STYLE,
} from '@/lib/utils';
import type { ForecastPoint } from '@/app/api/forecast/route';

const LAST_ACTUAL_YEAR = 2022;
const FIRST_YEAR = 2016;
const FINAL_YEAR = 2026;
const ALL_YEARS = [2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026];

// Position of the 2022/2023 boundary along the slider track (accounting for 11px thumb half-width)
// pct = (6.5 steps / 10 steps) * 100 = 65%
// Adjusted for thumb padding: calc(11px + 65% * (100% - 22px)) ≈ calc(65% - 3.3px)
const BOUNDARY_LEFT = 'calc(65% - 3px)';

function yearToPct(year: number) {
  return ((year - FIRST_YEAR) / (FINAL_YEAR - FIRST_YEAR)) * 100;
}

const METRIC_OPTIONS = [
  { key: 'poverty_rate' as const, label: 'Poverty Rate', unit: '%' },
  { key: 'stress_index' as const, label: 'Stress Index', unit: '' },
];
type MetricKey = 'poverty_rate' | 'stress_index';

interface ChartRow {
  year: number;
  actual: number | undefined;
  forecast: number | undefined;
  ci_low: number | undefined;
  ci_band: number | undefined;
}

interface MapDeltaRow {
  marz: string;
  current: number | null;
  previous: number | null;
  delta: number | null;
}

// ── Shared sub-components ────────────────────────────────────────────────────

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      display: 'block',
      fontSize: '0.75rem',
      color: 'var(--text-muted)',
      fontFamily: 'var(--font-sans)',
      marginBottom: '0.25rem',
    }}>
      {children}
    </span>
  );
}

function SegmentedButtons<T extends string>({
  options, value, onChange,
}: {
  options: { key: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div style={{
      display: 'flex',
      gap: '0.25rem',
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)',
      padding: '0.2rem',
    }}>
      {options.map((opt) => (
        <button
          key={opt.key}
          onClick={() => onChange(opt.key)}
          style={{
            padding: '0.25rem 0.75rem',
            borderRadius: 'var(--radius-md)',
            fontSize: '0.75rem',
            fontFamily: 'var(--font-sans)',
            fontWeight: value === opt.key ? 500 : 400,
            background: value === opt.key ? 'var(--stone-900)' : 'transparent',
            color: value === opt.key ? 'var(--stone-50)' : 'var(--text-muted)',
            border: 'none',
            cursor: 'pointer',
            transition: 'background 0.12s, color 0.12s',
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function RegionSelect({ marzes, value, onChange }: {
  marzes: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        padding: '0.375rem 0.75rem',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--border)',
        background: 'var(--surface)',
        color: 'var(--text-primary)',
        fontSize: '0.8125rem',
        fontFamily: 'var(--font-sans)',
        cursor: 'pointer',
      }}
    >
      {marzes.map((m) => (
        <option key={m} value={m}>{m}</option>
      ))}
    </select>
  );
}

// ── Custom tooltip ────────────────────────────────────────────────────────────

function CustomTooltip({ active, payload, label, metric }: {
  active?: boolean;
  payload?: Array<{ dataKey: string; value: unknown }>;
  label?: number;
  metric: MetricKey;
}) {
  if (!active || !payload?.length) return null;

  const fmt = (v: number) =>
    metric === 'poverty_rate' ? `${v.toFixed(1)}%` : v.toFixed(3);

  const get = (key: string) => {
    const item = payload.find((p) => p.dataKey === key);
    return typeof item?.value === 'number' ? item.value : null;
  };

  const actualVal = get('actual');
  const forecastVal = get('forecast');
  const ciLow = get('ci_low');
  const ciBand = get('ci_band');
  const ciHighVal = ciLow !== null && ciBand !== null ? ciLow + ciBand : null;

  return (
    <div style={{ ...CHART_TOOLTIP_CONTENT_STYLE, padding: '0.625rem 0.875rem', minWidth: 148 }}>
      <p style={{ ...CHART_TOOLTIP_LABEL_STYLE, marginBottom: '0.3rem', fontSize: 11 }}>{label}</p>
      {actualVal !== null && (
        <p style={{ ...CHART_TOOLTIP_ITEM_STYLE, fontSize: 11, margin: '0.1rem 0' }}>
          Observed: {fmt(actualVal)}
        </p>
      )}
      {forecastVal !== null && (
        <p style={{ ...CHART_TOOLTIP_ITEM_STYLE, fontSize: 11, margin: '0.1rem 0' }}>
          Forecast: {fmt(forecastVal)}
        </p>
      )}
      {ciLow !== null && ciHighVal !== null && (
        <p style={{ color: '#a5b4fc', fontSize: 10, margin: '0.1rem 0' }}>
          95% CI: [{fmt(ciLow)}, {fmt(ciHighVal)}]
        </p>
      )}
    </div>
  );
}

// ── Legend item ───────────────────────────────────────────────────────────────

function LegendItem({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
      <svg width="20" height="4">
        <line x1="0" y1="2" x2="20" y2="2"
          stroke={color} strokeWidth="2.5"
          strokeDasharray={dashed ? '6 3' : undefined}
        />
      </svg>
      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-sans)' }}>
        {label}
      </span>
    </div>
  );
}

// ── Year slider ───────────────────────────────────────────────────────────────

function YearSlider({ year, onChange }: { year: number; onChange: (y: number) => void }) {
  const isForecast = year > LAST_ACTUAL_YEAR;
  const thumbColor = isForecast ? '#d97706' : '#236699';
  const pct = yearToPct(year);

  // Dual-zone track gradient: blue for observed zone, amber for forecast zone,
  // dimmed for the unselected portion after the thumb.
  const observedEnd = Math.min(pct, 65);
  const forecastStart = 65;
  const trackBg = pct <= 65
    ? `linear-gradient(to right,
        #236699 0%,
        #236699 ${pct}%,
        #DDD8CF ${pct}%,
        #DDD8CF 65%,
        rgba(245,158,11,0.18) 65%,
        rgba(245,158,11,0.18) 100%)`
    : `linear-gradient(to right,
        #236699 0%,
        #236699 ${observedEnd}%,
        #d97706 ${forecastStart}%,
        #d97706 ${pct}%,
        #DDD8CF ${pct}%,
        #DDD8CF 100%)`;

  return (
    <div>
      {/* Year display + badge */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.625rem', marginBottom: '0.875rem' }}>
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '2.25rem',
          fontWeight: 700,
          lineHeight: 1,
          color: thumbColor,
          letterSpacing: '-0.02em',
          transition: 'color 0.15s',
        }}>
          {year}
        </span>
        <span style={{
          fontFamily: 'var(--font-sans)',
          fontSize: '0.75rem',
          fontWeight: 500,
          padding: '0.1875rem 0.5rem',
          borderRadius: 'var(--radius-md)',
          background: isForecast ? 'rgba(245,158,11,0.12)' : 'rgba(35,102,153,0.10)',
          color: thumbColor,
          border: `1px solid ${isForecast ? 'rgba(245,158,11,0.3)' : 'rgba(35,102,153,0.25)'}`,
          transition: 'all 0.15s',
        }}>
          {isForecast ? 'forecast' : 'observed'}
        </span>
      </div>

      {/* Slider track + boundary marker */}
      <div style={{ position: 'relative', paddingBottom: '1.75rem' }}>
        <input
          type="range"
          min={FIRST_YEAR}
          max={FINAL_YEAR}
          step={1}
          value={year}
          onChange={(e) => onChange(Number(e.target.value))}
          className="year-slider"
          style={{
            background: trackBg,
            // CSS custom property consumed by the thumb pseudo-element
            ['--thumb-color' as string]: thumbColor,
          }}
        />

        {/* 2022 | 2023 boundary line */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            left: BOUNDARY_LEFT,
            top: -2,
            width: 1,
            height: 10,
            background: 'var(--stone-400)',
            pointerEvents: 'none',
          }}
        />

        {/* Zone labels */}
        <div style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          display: 'flex',
          justifyContent: 'space-between',
          pointerEvents: 'none',
        }}>
          {ALL_YEARS.map((yr) => (
            <button
              key={yr}
              onClick={() => onChange(yr)}
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.625rem',
                fontWeight: yr === year ? 700 : 400,
                color: yr === year ? thumbColor : yr > LAST_ACTUAL_YEAR ? 'rgba(217,119,6,0.55)' : 'var(--text-faint)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 0,
                pointerEvents: 'auto',
                transition: 'color 0.1s',
              }}
            >
              {yr}
            </button>
          ))}
        </div>
      </div>

      {/* Zone legend */}
      <div style={{ display: 'flex', gap: '1rem', marginTop: '0.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          <div style={{ width: 20, height: 4, borderRadius: 2, background: '#236699' }} />
          <span style={{ fontSize: '0.6875rem', fontFamily: 'var(--font-sans)', color: 'var(--text-faint)' }}>
            ILCS observed
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          <div style={{ width: 20, height: 4, borderRadius: 2, background: '#d97706' }} />
          <span style={{ fontSize: '0.6875rem', fontFamily: 'var(--font-sans)', color: 'var(--text-faint)' }}>
            Ensemble forecast
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ForecastTimeline() {
  const { data, error } = useSWR<ForecastPoint[]>('/api/forecast', apiFetcher);

  // Chart state
  const [chartMarz, setChartMarz] = useState('Armenia (national)');
  const [metric, setMetric] = useState<MetricKey>('poverty_rate');
  const [showCI, setShowCI] = useState(true);

  // Map state — independent year + region highlight
  const [mapYear, setMapYear] = useState(2026);
  const [mapMetric, setMapMetric] = useState<MetricKey>('poverty_rate');

  const marzes = useMemo(() => {
    if (!data) return [];
    return [...new Set(data.map((d) => d.marz))].sort((a, b) => {
      if (a === 'Armenia (national)') return -1;
      if (b === 'Armenia (national)') return 1;
      return a.localeCompare(b);
    });
  }, [data]);

  // Marzes for map (no national aggregate — it has no GeoJSON feature)
  const mapMarzes = useMemo(
    () => marzes.filter((m) => m !== 'Armenia (national)'),
    [marzes]
  );

  const [mapHighlight, setMapHighlight] = useState<string | null>(null);

  // Chart data for selected region
  const chartData = useMemo((): ChartRow[] => {
    if (!data) return [];
    const rows = data.filter((d) => d.marz === chartMarz);
    const years = [...new Set(rows.map((d) => d.year))].sort((a, b) => a - b);

    return years.map((year) => {
      const actualRow = rows.find((r) => r.year === year && !r.is_forecast);
      const forecastRow = rows.find((r) => r.year === year && r.is_forecast);

      const val = (r: ForecastPoint) =>
        metric === 'poverty_rate' ? r.poverty_rate : r.stress_index;
      const low = (r: ForecastPoint) =>
        metric === 'poverty_rate' ? r.poverty_low : r.stress_low;
      const high = (r: ForecastPoint) =>
        metric === 'poverty_rate' ? r.poverty_high : r.stress_high;

      const actualVal = actualRow ? val(actualRow) : undefined;
      const forecastVal = forecastRow
        ? val(forecastRow)
        : year === LAST_ACTUAL_YEAR && actualRow
        ? val(actualRow)
        : undefined;

      const lo = forecastRow ? low(forecastRow) : null;
      const hi = forecastRow ? high(forecastRow) : null;

      return {
        year,
        actual: actualVal,
        forecast: forecastVal,
        ci_low: lo !== null && hi !== null ? lo : undefined,
        ci_band: lo !== null && hi !== null ? hi - lo : undefined,
      };
    });
  }, [data, chartMarz, metric]);

  // Map data: all marzes for the selected year + metric
  const choroplethData = useMemo(() => {
    if (!data) return [];
    const isForecastYear = mapYear > LAST_ACTUAL_YEAR;
    return data
      .filter((d) =>
        d.year === mapYear &&
        d.marz !== 'Armenia (national)' &&
        d.is_forecast === isForecastYear
      )
      .map((d) => ({
        marz: d.marz,
        value: mapMetric === 'poverty_rate' ? d.poverty_rate : d.stress_index,
      }));
  }, [data, mapYear, mapMetric]);

  const fmtMetric = (value: number | null | undefined, metricKey: MetricKey) => {
    if (value === null || value === undefined) return '—';
    return metricKey === 'poverty_rate' ? `${value.toFixed(1)}%` : value.toFixed(3);
  };

  const mapComparison = useMemo((): MapDeltaRow[] => {
    if (!data) return [];

    return mapMarzes
      .map((marz) => {
        const rows = data
          .filter((d) => d.marz === marz)
          .sort((a, b) => a.year - b.year);
        const currentRow = rows.find((d) => d.year === mapYear);
        const previousRow = rows
          .filter((d) => d.year < mapYear)
          .sort((a, b) => b.year - a.year)[0];

        const current = currentRow
          ? mapMetric === 'poverty_rate'
            ? currentRow.poverty_rate
            : currentRow.stress_index
          : null;
        const previous = previousRow
          ? mapMetric === 'poverty_rate'
            ? previousRow.poverty_rate
            : previousRow.stress_index
          : null;

        return {
          marz,
          current,
          previous,
          delta: current !== null && previous !== null ? current - previous : null,
        };
      })
      .sort((a, b) => {
        if (a.delta === null && b.delta === null) return a.marz.localeCompare(b.marz);
        if (a.delta === null) return 1;
        if (b.delta === null) return -1;
        return b.delta - a.delta;
      });
  }, [data, mapMarzes, mapMetric, mapYear]);

  const highlightedComparison = useMemo(() => {
    if (!mapHighlight) return null;
    return mapComparison.find((row) => row.marz === mapHighlight) ?? null;
  }, [mapComparison, mapHighlight]);

  const averageDelta = useMemo(() => {
    const deltas = mapComparison.map((row) => row.delta).filter((v): v is number => v !== null);
    if (!deltas.length) return null;
    return deltas.reduce((sum, value) => sum + value, 0) / deltas.length;
  }, [mapComparison]);

  const biggestIncrease = mapComparison.find((row) => row.delta !== null) ?? null;
  const biggestDecrease = [...mapComparison].reverse().find((row) => row.delta !== null) ?? null;

  const ciIsWide = useMemo(() => {
    if (!showCI) return false;
    const threshold = metric === 'poverty_rate' ? 80 : 10;
    return chartData.some((d) => d.ci_band !== undefined && d.ci_band > threshold);
  }, [chartData, metric, showCI]);

  const tickFmt = (v: number) =>
    metric === 'poverty_rate' ? `${v.toFixed(0)}%` : v.toFixed(2);

  if (error) {
    return (
      <div style={{ color: 'var(--warm-500)', padding: '1rem', fontFamily: 'var(--font-sans)', fontSize: '0.875rem' }}>
        {getErrorMessage(error, 'Unable to load forecast data.')}
      </div>
    );
  }

  if (!data) {
    return (
      <div style={{ color: 'var(--text-muted)', padding: '2rem', textAlign: 'center', fontFamily: 'var(--font-sans)' }}>
        Loading…
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>

      {/* ══════════════════════════════════════════════════════════════════════
          SECTION 1 — Line chart
      ════════════════════════════════════════════════════════════════════════ */}
      <div
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          padding: '1.5rem',
        }}
      >
        {/* Chart controls */}
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: '1.25rem' }}>
          <div>
            <Label>Region</Label>
            <RegionSelect marzes={marzes} value={chartMarz} onChange={setChartMarz} />
          </div>
          <div>
            <Label>Metric</Label>
            <SegmentedButtons options={METRIC_OPTIONS} value={metric} onChange={setMetric} />
          </div>
          <label style={{
            display: 'flex', alignItems: 'center', gap: '0.4rem',
            fontSize: '0.8125rem', fontFamily: 'var(--font-sans)',
            color: 'var(--text-muted)', cursor: 'pointer', paddingBottom: '0.375rem',
          }}>
            <input type="checkbox" checked={showCI} onChange={(e) => setShowCI(e.target.checked)} style={{ cursor: 'pointer' }} />
            Show 95% CI
          </label>
        </div>

        {/* Wide-CI warning */}
        {ciIsWide && (
          <div style={{
            background: 'var(--warning-bg)',
            border: '1px solid #E8C98A',
            borderRadius: 'var(--radius-md)',
            padding: '0.625rem 1rem',
            fontSize: '0.8125rem',
            fontFamily: 'var(--font-sans)',
            color: 'var(--warning)',
            lineHeight: 1.55,
            marginBottom: '1rem',
          }}>
            Wide CI — high model uncertainty for this region. Uncheck CI to see the trend more clearly.
          </div>
        )}

        <h3 style={{
          fontFamily: 'var(--font-sans)', fontWeight: 500,
          fontSize: '0.875rem', color: 'var(--text-secondary)',
          marginBottom: '0.25rem',
        }}>
          {metric === 'poverty_rate' ? 'Poverty Rate' : 'Stress Index'} — {chartMarz}
        </h3>
        <p style={{
          fontSize: '0.75rem', color: 'var(--text-faint)',
          marginBottom: '1.25rem', fontFamily: 'var(--font-sans)', lineHeight: 1.5,
        }}>
          Solid = observed ILCS · Dashed = Ensemble forecast · Shaded = 95% CI
        </p>

        <ResponsiveContainer width="100%" height={380}>
          <ComposedChart data={chartData} margin={{ top: 8, right: 24, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--stone-100)" />
            <XAxis dataKey="year" tick={{ fontSize: 12, fill: 'var(--text-faint)' }} tickLine={false} />
            <YAxis
              tick={{ fontSize: 12, fill: 'var(--text-faint)' }}
              tickLine={false} axisLine={false}
              tickFormatter={tickFmt} width={52}
            />
            <Tooltip content={<CustomTooltip metric={metric} />} />

            {showCI && (
              <>
                <Area dataKey="ci_low" stackId="ci"
                  fill="transparent" stroke="none"
                  dot={false} activeDot={false} legendType="none"
                  connectNulls={false} isAnimationActive={false}
                />
                <Area dataKey="ci_band" stackId="ci"
                  fill="rgba(99,102,241,0.13)"
                  stroke="rgba(99,102,241,0.25)" strokeWidth={0.75}
                  dot={false} activeDot={false} legendType="none"
                  connectNulls={false} isAnimationActive={false}
                />
              </>
            )}

            <ReferenceLine x={LAST_ACTUAL_YEAR}
              stroke="var(--stone-300)" strokeDasharray="4 3"
              label={{ value: 'forecast →', position: 'insideTopRight', fontSize: 10, fill: 'var(--text-faint)', dy: -6 }}
            />
            <Line type="monotone" dataKey="actual"
              stroke="var(--cool-600)" strokeWidth={2.5}
              dot={{ r: 3.5, fill: 'var(--cool-600)', strokeWidth: 0 }}
              activeDot={{ r: 5.5 }}
              connectNulls={false} isAnimationActive={false}
            />
            <Line type="monotone" dataKey="forecast"
              stroke="#f59e0b" strokeWidth={2.5}
              strokeDasharray="7 3"
              dot={false} activeDot={{ r: 5.5, fill: '#f59e0b' }}
              connectNulls={false} isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>

        <div style={{ marginTop: '1rem', display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
          <LegendItem color="var(--cool-600)" label="Observed (ILCS)" />
          <LegendItem color="#f59e0b" dashed label="Forecast (Ensemble)" />
          {showCI && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <div style={{
                width: 16, height: 10,
                background: 'rgba(99,102,241,0.2)',
                border: '1px solid rgba(99,102,241,0.4)',
                borderRadius: 2,
              }} />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-sans)' }}>
                95% CI
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          SECTION 2 — Choropleth
      ════════════════════════════════════════════════════════════════════════ */}
      <div
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          padding: '1.5rem',
        }}
      >
        {/* Map controls */}
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: '1.25rem' }}>
          {/* Year slider */}
          <div style={{ flex: 1, minWidth: 280 }}>
            <YearSlider year={mapYear} onChange={setMapYear} />
          </div>

          {/* Metric for map */}
          <div>
            <Label>Metric</Label>
            <SegmentedButtons options={METRIC_OPTIONS} value={mapMetric} onChange={setMapMetric} />
          </div>

          {/* Region highlight */}
          <div>
            <Label>Highlight region</Label>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <RegionSelect marzes={mapMarzes} value={mapHighlight ?? ''} onChange={(v) => setMapHighlight(v || null)} />
              {mapHighlight && (
                <button
                  onClick={() => setMapHighlight(null)}
                  style={{
                    padding: '0.375rem 0.5rem',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border)',
                    background: 'var(--surface)',
                    color: 'var(--text-muted)',
                    fontSize: '0.75rem',
                    fontFamily: 'var(--font-sans)',
                    cursor: 'pointer',
                  }}
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        </div>

        <h3 style={{
          fontFamily: 'var(--font-sans)', fontWeight: 500,
          fontSize: '0.875rem', color: 'var(--text-secondary)',
          marginBottom: '0.2rem',
        }}>
          {mapMetric === 'poverty_rate' ? 'Poverty Rate' : 'Stress Index'} by Marz — {mapYear}
          {mapYear > LAST_ACTUAL_YEAR && (
            <span style={{ marginLeft: '0.5rem', fontSize: '0.75rem', color: '#d97706', fontWeight: 400 }}>
              (Ensemble forecast)
            </span>
          )}
        </h3>
        <p style={{
          fontSize: '0.75rem', color: 'var(--text-faint)',
          marginBottom: '1.25rem', fontFamily: 'var(--font-sans)',
        }}>
          Click any region to load its trend in the chart above. The comparison ledger below updates with the selected year.
        </p>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '0.75rem',
            marginBottom: '1rem',
          }}
        >
          <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '0.875rem', background: 'var(--surface-raised)' }}>
            <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-faint)', marginBottom: '0.35rem' }}>
              Selected Year Average Delta
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.1rem', color: averageDelta !== null && averageDelta >= 0 ? 'var(--warm-600)' : 'var(--success)' }}>
              {averageDelta !== null ? `${averageDelta >= 0 ? '+' : ''}${fmtMetric(averageDelta, mapMetric)}` : '—'}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
              Compared with the most recent previous year available for each marz.
            </div>
          </div>

          <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '0.875rem', background: 'var(--surface-raised)' }}>
            <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-faint)', marginBottom: '0.35rem' }}>
              Largest Increase
            </div>
            <div style={{ fontSize: '0.95rem', color: 'var(--text-primary)', fontWeight: 500 }}>
              {biggestIncrease?.marz ?? '—'}
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.95rem', color: 'var(--warm-600)', marginTop: '0.2rem' }}>
              {biggestIncrease?.delta !== null && biggestIncrease?.delta !== undefined
                ? `+${fmtMetric(biggestIncrease.delta, mapMetric)}`
                : '—'}
            </div>
          </div>

          <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '0.875rem', background: 'var(--surface-raised)' }}>
            <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-faint)', marginBottom: '0.35rem' }}>
              Largest Decrease
            </div>
            <div style={{ fontSize: '0.95rem', color: 'var(--text-primary)', fontWeight: 500 }}>
              {biggestDecrease?.marz ?? '—'}
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.95rem', color: 'var(--success)', marginTop: '0.2rem' }}>
              {biggestDecrease?.delta !== null && biggestDecrease?.delta !== undefined
                ? `${fmtMetric(biggestDecrease.delta, mapMetric)}`
                : '—'}
            </div>
          </div>

          <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '0.875rem', background: 'var(--surface-raised)' }}>
            <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-faint)', marginBottom: '0.35rem' }}>
              Highlighted Region
            </div>
            <div style={{ fontSize: '0.95rem', color: 'var(--text-primary)', fontWeight: 500 }}>
              {highlightedComparison?.marz ?? 'None selected'}
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.2rem', lineHeight: 1.5 }}>
              {highlightedComparison
                ? `${fmtMetric(highlightedComparison.previous, mapMetric)} → ${fmtMetric(highlightedComparison.current, mapMetric)} (${highlightedComparison.delta !== null && highlightedComparison.delta >= 0 ? '+' : ''}${fmtMetric(highlightedComparison.delta, mapMetric)})`
                : 'Click a marz on the map to pin its year-over-year change here.'}
            </div>
          </div>
        </div>

        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          {choroplethData.length > 0 && (
            <ChoroplethMap
              data={choroplethData}
              indicator={mapMetric}
              colorScheme={mapMetric === 'poverty_rate' ? 'warm' : 'cool'}
              onRegionClick={(marz) => {
                setChartMarz(marz);
                setMapHighlight(marz);
              }}
              selectedMarz={mapHighlight}
            />
          )}
        </div>

        <div
          style={{
            marginTop: '1.25rem',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            overflow: 'hidden',
            background: 'var(--surface-raised)',
          }}
        >
          <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--border-subtle)', fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-sans)' }}>
            Marz comparison ledger for {mapYear}: current value, previous available value, and year-over-year delta.
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', fontSize: '0.75rem', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-subtle)', background: 'var(--surface-subtle)' }}>
                  <th style={{ textAlign: 'left', padding: '0.65rem 1rem', color: 'var(--text-faint)', fontWeight: 500 }}>Marz</th>
                  <th style={{ textAlign: 'right', padding: '0.65rem 1rem', color: 'var(--text-faint)', fontWeight: 500 }}>Current</th>
                  <th style={{ textAlign: 'right', padding: '0.65rem 1rem', color: 'var(--text-faint)', fontWeight: 500 }}>Previous</th>
                  <th style={{ textAlign: 'right', padding: '0.65rem 1rem', color: 'var(--text-faint)', fontWeight: 500 }}>Delta</th>
                </tr>
              </thead>
              <tbody>
                {mapComparison.map((row) => (
                  <tr
                    key={`${mapYear}-${row.marz}`}
                    style={{
                      borderBottom: '1px solid var(--border-subtle)',
                      background: row.marz === mapHighlight ? 'rgba(35,102,153,0.08)' : 'transparent',
                    }}
                  >
                    <td style={{ padding: '0.65rem 1rem', color: 'var(--text-primary)', fontWeight: row.marz === mapHighlight ? 600 : 400 }}>
                      {row.marz}
                    </td>
                    <td style={{ padding: '0.65rem 1rem', textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                      {fmtMetric(row.current, mapMetric)}
                    </td>
                    <td style={{ padding: '0.65rem 1rem', textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                      {fmtMetric(row.previous, mapMetric)}
                    </td>
                    <td
                      style={{
                        padding: '0.65rem 1rem',
                        textAlign: 'right',
                        fontFamily: 'var(--font-mono)',
                        color: row.delta === null ? 'var(--text-faint)' : row.delta >= 0 ? 'var(--warm-600)' : 'var(--success)',
                      }}
                    >
                      {row.delta === null ? '—' : `${row.delta >= 0 ? '+' : ''}${fmtMetric(row.delta, mapMetric)}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

    </div>
  );
}
