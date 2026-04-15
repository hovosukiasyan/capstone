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
  { key: 'poverty', label: 'Poverty Forecasting' },
  { key: 'stress', label: 'Stress Index' },
  { key: 'augmentation_baseline', label: 'Augmentation Baseline' },
  { key: 'augmentation_nn', label: 'Augmentation NN' },
  { key: 'poverty_nn_activation', label: 'NN Activation Sweep' },
  { key: 'poverty_nn_layer', label: 'NN Layer Sweep' },
] as const;

type TabKey = typeof TABS[number]['key'];

interface ForecastRow {
  source: string;
  model: string;
  frequency: string | null;
  r2: number | null;
  mae: number | null;
}

export default function ForecastingPage() {
  const [tab, setTab] = useState<TabKey>('poverty');

  const { data, error } = useSWR<ForecastRow[]>(`/api/models/forecasting?source=${tab}`, apiFetcher);

  const rows = (data ?? []).filter((r) => r.r2 !== null);

  // For augmentation tabs, group by frequency
  const hasFreq = ['augmentation_baseline', 'augmentation_nn'].includes(tab);

  const chartData = hasFreq
    ? rows.map((r) => ({
        name: `${r.frequency ?? ''} / ${r.model}`,
        r2: r.r2 ?? 0,
        mae: r.mae ?? 0,
      }))
    : rows.map((r) => ({
        name: r.model,
        r2: r.r2 ?? 0,
        mae: r.mae ?? 0,
      }));

  const maxR2 = Math.max(...chartData.map((d) => d.r2), 0);
  const minR2 = Math.min(...chartData.map((d) => d.r2), 0);

  return (
    <div>
      <PageHeader
        title="Forecasting Results"
        subtitle="Model performance on poverty rate and stress index prediction."
      />

      {/* Tabs */}
      <div className="mb-6 flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-white p-1">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              tab === key
                ? 'bg-blue-600 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {error ? (
        <ErrorState message={getErrorMessage(error, 'Unable to load forecasting results.')} />
      ) : !data ? (
        <div className="flex items-center justify-center h-64 text-slate-400">Loading...</div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-400">
          No results available for this source.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {/* R² chart */}
          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <h3 className="text-sm font-semibold text-slate-700 mb-4">R² Score</h3>
            <ResponsiveContainer width="100%" height={Math.max(200, chartData.length * 32)}>
              <BarChart
                data={chartData}
                layout="vertical"
                margin={{ top: 0, right: 20, left: 140, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                <XAxis
                  type="number"
                  domain={[Math.min(minR2, -0.1), Math.max(maxR2, 1.05)]}
                  tick={{ fontSize: 11, fill: '#94a3b8' }}
                  tickLine={false}
                  tickFormatter={(v) => v.toFixed(2)}
                />
                <YAxis
                  dataKey="name"
                  type="category"
                  tick={{ fontSize: 10, fill: '#64748b' }}
                  tickLine={false}
                  axisLine={false}
                  width={135}
                />
                <Tooltip
                  contentStyle={CHART_TOOLTIP_CONTENT_STYLE}
                  labelStyle={CHART_TOOLTIP_LABEL_STYLE}
                  itemStyle={CHART_TOOLTIP_ITEM_STYLE}
                  formatter={(v: unknown) => [Number(v).toFixed(4), 'R²']}
                />
                <ReferenceLine x={0} stroke="#94a3b8" strokeWidth={1} />
                <Bar dataKey="r2" radius={[0, 4, 4, 0]}>
                  {chartData.map((d, i) => (
                    <Cell
                      key={i}
                      fill={d.r2 >= 0.9 ? '#10b981' : d.r2 >= 0 ? '#3b82f6' : '#ef4444'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Table */}
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="text-left px-4 py-3 font-medium text-slate-500">Model</th>
                  {hasFreq && <th className="text-left px-4 py-3 font-medium text-slate-500">Freq</th>}
                  <th className="text-right px-4 py-3 font-medium text-slate-500">R²</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-500">MAE</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="px-4 py-2.5 text-slate-700 text-xs">{r.model}</td>
                    {hasFreq && <td className="px-4 py-2.5 text-slate-500 text-xs">{r.frequency}</td>}
                    <td className="px-4 py-2.5 text-right tabular-nums font-medium">
                      <span className={
                        (r.r2 ?? 0) >= 0.9 ? 'text-emerald-600' :
                        (r.r2 ?? 0) >= 0 ? 'text-blue-600' : 'text-rose-500'
                      }>
                        {(r.r2 ?? 0).toFixed(4)}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-slate-600 text-xs">
                      {r.mae !== null ? r.mae.toFixed(3) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'poverty' && (
        <div className="mt-4 rounded-lg bg-blue-50 border border-blue-100 px-4 py-3 text-sm text-blue-700">
          <strong>Key insight:</strong> The lag-1 baseline (R²=0.999 monthly) is extremely strong because
          the panel data was interpolated from annual ArmStat estimates — creating high autocorrelation.
          The real ML value is extrapolating beyond 2022.
        </div>
      )}
    </div>
  );
}
