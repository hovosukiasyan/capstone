'use client';

import { useState } from 'react';
import useSWR from 'swr';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, ReferenceLine,
} from 'recharts';
import ErrorState from '@/components/layout/ErrorState';
import PageHeader from '@/components/layout/PageHeader';
import { apiFetcher, getErrorMessage } from '@/lib/fetcher';
import {
  CHART_TOOLTIP_CONTENT_STYLE,
  CHART_TOOLTIP_ITEM_STYLE,
  CHART_TOOLTIP_LABEL_STYLE,
} from '@/lib/utils';

const TABS = [
  { key: 'poverty',               label: 'Poverty Forecasting' },
  { key: 'stress',                label: 'Stress Index' },
  { key: 'time_series_classical', label: 'Classical TS (ARIMA)' },
  { key: 'time_series_nn',        label: 'Advanced NNs' },
  { key: 'augmentation_baseline', label: 'Augmentation Baseline' },
  { key: 'augmentation_nn',       label: 'Augmentation NN' },
  { key: 'poverty_nn_activation', label: 'NN Activation Sweep' },
  { key: 'poverty_nn_layer',      label: 'NN Layer Sweep' },
] as const;

type TabKey = typeof TABS[number]['key'];

interface ForecastRow {
  source: string;
  model: string;
  frequency: string | null;
  r2: number | null;
  mae: number | null;
}

// ── Methodology callouts ──────────────────────────────────────────────────────

const CALLOUTS: Partial<Record<TabKey, { type: 'info' | 'warn'; title: string; body: string }>> = {
  poverty: {
    type: 'info',
    title: 'Baseline beats all models on observed yearly data',
    body: 'The lag-1 persistence baseline (R² ≈ 0.73) outperforms every ML and neural network model on real annually-observed poverty rates. This reflects how slowly regional poverty rates change year over year — a property that linear regression and tree models struggle to capture better than simple persistence on a 77-observation panel.',
  },
  stress: {
    type: 'warn',
    title: 'Linear regression R² = 1.0 is a data integrity flag',
    body: 'Perfect R² for linear regression almost certainly reflects near-perfect multicollinearity — the stress index appears to be a near-deterministic function of its own component variables. Random Forest and SVR results on this tab are more meaningful, but still need to be interpreted with caution given the small panel size (77 observations across 11 marzes × 7 years).',
  },
  time_series_classical: {
    type: 'info',
    title: 'ARIMA, lag features, and ACF/PACF on all three frequencies',
    body: 'Classical time series techniques applied per-region then aggregated. Yearly results use real ILCS observations (most reliable). Monthly and daily panels were created by linear interpolation — consecutive rows are nearly identical by construction, which inflates lag-based R² scores close to 1.0 at those frequencies. Model names ending in [stress] target the composite stress index; [poverty] target the poverty rate. ARIMA orders selected via AIC grid search; model name shows the mode order across regions.',
  },
  time_series_nn: {
    type: 'info',
    title: 'GRU, BiLSTM, Transformer, and TCN on all three frequencies',
    body: 'Advanced neural sequence models trained per frequency using a 12-month (or 3-year) look-back window. Yearly models use real ILCS observations (small data — treat results cautiously). Monthly and daily results are on interpolated data: the near-perfect autocorrelation makes sequence models look artificially strong compared to the yearly baseline R² ≈ 0.73. Compare same-frequency models against the Lag-1 Baseline shown in the Classical TS tab.',
  },
  augmentation_baseline: {
    type: 'warn',
    title: 'Interpolated data — R² values are not real predictive performance',
    body: 'The monthly (924 rows) and daily (27,797 rows) panels were created by linearly interpolating 77 real yearly observations. Baseline R² values near 1.0 for monthly/daily are a mathematical artifact of interpolation smoothness — consecutive time steps are nearly identical by construction. These results demonstrate why interpolation cannot substitute for real higher-frequency observations, not that forecasting is accurate.',
  },
  augmentation_nn: {
    type: 'warn',
    title: 'Neural networks fail on interpolated data',
    body: 'MLP models trained on the interpolated monthly and daily panels achieve catastrophically negative R² (e.g. −3.7 for monthly, −30.6 for daily). This is the expected outcome: interpolated data creates artificially smooth patterns that neural networks overfit to within a single "flat" trajectory, then fail to generalize on test splits that are actually from the same interpolation curve. More data points via interpolation does not help — it makes it worse. The yearly panel (real observed data) remains the only defensible frequency for forecasting.',
  },
};

// ── Frequency badge ───────────────────────────────────────────────────────────

const FREQ_COLORS: Record<string, string> = {
  yearly:  'var(--cool-600)',
  monthly: 'var(--success)',
  daily:   'var(--warm-500)',
};

function FreqBadge({ freq }: { freq: string | null }) {
  if (!freq) return null;
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '0.1rem 0.45rem',
        borderRadius: '0.25rem',
        fontSize: '0.7rem',
        fontFamily: 'var(--font-mono)',
        fontWeight: 600,
        background: 'color-mix(in srgb, currentColor 10%, transparent)',
        color: FREQ_COLORS[freq] ?? 'var(--text-muted)',
        border: `1px solid color-mix(in srgb, currentColor 20%, transparent)`,
      }}
    >
      {freq}
    </span>
  );
}

export default function ForecastingPage() {
  const [tab, setTab] = useState<TabKey>('poverty');

  const { data, error } = useSWR<ForecastRow[]>(`/api/models/forecasting?source=${tab}`, apiFetcher);

  const rows = (data ?? []).filter((r) => r.r2 !== null);

  // Augmentation tabs have a frequency column; classical TS tabs group by freq too
  const hasFreq = ['augmentation_baseline', 'augmentation_nn',
                   'time_series_classical', 'time_series_nn'].includes(tab);

  const chartData = rows.map((r) => ({
    name: hasFreq ? `${r.frequency ?? ''} · ${r.model}` : r.model,
    r2:   r.r2 ?? 0,
    mae:  r.mae ?? 0,
    freq: r.frequency,
  }));

  const maxR2 = Math.max(...chartData.map((d) => d.r2), 0);
  const minR2 = Math.min(...chartData.map((d) => d.r2), 0);

  const callout = CALLOUTS[tab];
  const isSweepTab = tab === 'poverty_nn_activation' || tab === 'poverty_nn_layer';
  const modelColumnLabel = isSweepTab ? 'Architecture' : 'Model';
  const sweepHint =
    tab === 'poverty_nn_activation'
      ? 'Rows show the exact activation function and hidden-layer layout for each MLP tested.'
      : tab === 'poverty_nn_layer'
      ? 'Rows show MLP depth, activation, hidden-layer layout, and total unit count for each architecture.'
      : null;

  return (
    <div>
      <PageHeader
        title="Forecasting Diagnostics"
        subtitle="Benchmark comparisons across model types and data frequencies. Includes important caveats about interpolated data."
      />

      <div className="mb-6 rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-800">
        <strong>This page shows model benchmarking experiments.</strong> For the held-out 2022 validation
        (training 2016–2021, testing against actual 2022 regional outcomes), see the{' '}
        <a href="/models/validation" className="underline font-medium">2022 Validation page</a>.
      </div>

      {/* Tabs */}
      <div
        className="mb-6 flex flex-wrap gap-1 p-1"
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
        }}
      >
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            style={{
              padding: '0.3125rem 0.75rem',
              borderRadius: 'var(--radius-md)',
              fontSize: '0.75rem',
              fontFamily: 'var(--font-sans)',
              fontWeight: tab === key ? 500 : 400,
              background: tab === key ? 'var(--stone-900)' : 'transparent',
              color: tab === key ? 'var(--stone-50)' : 'var(--text-muted)',
              border: 'none',
              cursor: 'pointer',
              transition: 'background 0.12s, color 0.12s',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Methodology callout */}
      {callout && (
        <div
          className="mb-5"
          style={{
            background: callout.type === 'warn' ? 'var(--warning-bg)' : 'var(--info-bg)',
            border: `1px solid ${callout.type === 'warn' ? '#E8C98A' : 'var(--cool-200)'}`,
            borderRadius: 'var(--radius-lg)',
            padding: '1rem 1.25rem',
          }}
        >
          <p
            style={{
              fontFamily: 'var(--font-sans)',
              fontWeight: 500,
              fontSize: '0.8125rem',
              color: callout.type === 'warn' ? 'var(--warning)' : 'var(--info)',
              marginBottom: '0.375rem',
            }}
          >
            {callout.title}
          </p>
          <p
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: '0.8125rem',
              lineHeight: 1.6,
              color: 'var(--stone-700)',
              margin: 0,
            }}
          >
            {callout.body}
          </p>
        </div>
      )}

      {error ? (
        <ErrorState message={getErrorMessage(error, 'Unable to load forecasting results.')} />
      ) : !data ? (
        <div className="flex items-center justify-center h-64" style={{ color: 'var(--text-muted)' }}>
          Loading...
        </div>
      ) : rows.length === 0 ? (
        <div
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)',
            padding: '2rem',
            textAlign: 'center',
            color: 'var(--text-muted)',
            fontSize: '0.875rem',
          }}
        >
          No results available for this source.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {/* R² chart */}
          <div
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)',
              padding: '1.5rem',
            }}
          >
            <h3
              style={{
                fontFamily: 'var(--font-sans)',
                fontWeight: 500,
                fontSize: '0.8125rem',
                color: 'var(--text-secondary)',
                marginBottom: '1rem',
              }}
            >
              R² Score
            </h3>
            {sweepHint && (
              <p
                style={{
                  marginTop: '-0.5rem',
                  marginBottom: '0.875rem',
                  fontSize: '0.75rem',
                  color: 'var(--text-faint)',
                  lineHeight: 1.55,
                }}
              >
                {sweepHint}
              </p>
            )}
            <ResponsiveContainer width="100%" height={Math.max(200, chartData.length * 32)}>
              <BarChart
                data={chartData}
                layout="vertical"
                margin={{ top: 0, right: 20, left: 160, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--stone-100)" />
                <XAxis
                  type="number"
                  domain={[Math.min(minR2 - 0.05, -0.1), Math.max(maxR2 + 0.05, 1.05)]}
                  tick={{ fontSize: 10, fill: 'var(--text-faint)' }}
                  tickLine={false}
                  tickFormatter={(v) => v.toFixed(2)}
                />
                <YAxis
                  dataKey="name"
                  type="category"
                  tick={{ fontSize: 9, fill: 'var(--text-muted)' }}
                  tickLine={false}
                  axisLine={false}
                  width={155}
                />
                <Tooltip
                  contentStyle={CHART_TOOLTIP_CONTENT_STYLE}
                  labelStyle={CHART_TOOLTIP_LABEL_STYLE}
                  itemStyle={CHART_TOOLTIP_ITEM_STYLE}
                  formatter={(v: unknown) => [Number(v).toFixed(4), 'R²']}
                />
                <ReferenceLine x={0} stroke="var(--stone-300)" strokeWidth={1} />
                <Bar dataKey="r2" radius={[0, 4, 4, 0]}>
                  {chartData.map((d, i) => (
                    <Cell
                      key={i}
                      fill={
                        d.r2 >= 0.9 ? 'var(--success)' :
                        d.r2 >= 0   ? 'var(--cool-600)' :
                        'var(--warm-500)'
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Table */}
          <div
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)',
              overflow: 'hidden',
            }}
          >
            <table style={{ width: '100%', fontSize: '0.8125rem', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-subtle)', background: 'var(--surface-subtle)' }}>
                  <th style={{ textAlign: 'left', padding: '0.75rem 1rem', fontWeight: 500, color: 'var(--text-muted)', fontFamily: 'var(--font-sans)' }}>
                    {modelColumnLabel}
                  </th>
                  {hasFreq && (
                    <th style={{ textAlign: 'left', padding: '0.75rem 0.5rem', fontWeight: 500, color: 'var(--text-muted)', fontFamily: 'var(--font-sans)' }}>
                      Freq.
                    </th>
                  )}
                  <th style={{ textAlign: 'right', padding: '0.75rem 1rem', fontWeight: 500, color: 'var(--text-muted)', fontFamily: 'var(--font-sans)' }}>
                    R²
                  </th>
                  <th style={{ textAlign: 'right', padding: '0.75rem 1rem', fontWeight: 500, color: 'var(--text-muted)', fontFamily: 'var(--font-sans)' }}>
                    MAE
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <td style={{ padding: '0.625rem 1rem', fontFamily: 'var(--font-sans)', color: 'var(--text-secondary)' }}>
                      {r.model}
                    </td>
                    {hasFreq && (
                      <td style={{ padding: '0.625rem 0.5rem' }}>
                        <FreqBadge freq={r.frequency} />
                      </td>
                    )}
                    <td
                      style={{
                        padding: '0.625rem 1rem',
                        textAlign: 'right',
                        fontFamily: 'var(--font-mono)',
                        fontWeight: 500,
                        color: (r.r2 ?? 0) >= 0.9 ? 'var(--success)' :
                               (r.r2 ?? 0) >= 0   ? 'var(--cool-600)' :
                               'var(--warm-500)',
                      }}
                    >
                      {(r.r2 ?? 0).toFixed(4)}
                    </td>
                    <td style={{ padding: '0.625rem 1rem', textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                      {r.mae !== null ? r.mae.toFixed(3) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
