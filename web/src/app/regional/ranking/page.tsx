'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import ErrorState from '@/components/layout/ErrorState';
import PageHeader from '@/components/layout/PageHeader';
import { REGIONAL_INDICATORS } from '@/lib/constants';
import { apiFetcher, getErrorMessage } from '@/lib/fetcher';
import {
  CHART_TOOLTIP_CONTENT_STYLE,
  CHART_TOOLTIP_ITEM_STYLE,
  CHART_TOOLTIP_LABEL_STYLE,
  changeArrow,
  formatPct,
  getIndicatorColor,
} from '@/lib/utils';
import type { RankingRow } from '@/lib/types';

export default function RegionalRankingPage() {
  const [indicator, setIndicator] = useState('poverty_rate');
  const [year, setYear] = useState(2022);

  const { data, error } = useSWR<RankingRow[]>(
    `/api/regional/ranking?indicator=${indicator}&year=${year}`,
    apiFetcher
  );

  const indicatorMeta = REGIONAL_INDICATORS.find((i) => i.key === indicator);
  const isPct = ['poverty_rate', 'extreme_poverty_rate'].includes(indicator);
  const values = (data ?? []).map((row) => row.value).filter((value): value is number => value !== null);
  const minValue = values.length > 0 ? Math.min(...values) : 0;
  const maxValue = values.length > 0 ? Math.max(...values) : 0;

  const fmt = (v: number | null) => {
    if (v === null) return '—';
    return isPct ? formatPct(v) : v.toFixed(2);
  };

  return (
    <div>
      <PageHeader
        title="Regional Rankings"
        subtitle="Observed data only, 2016–2022. Compare all 11 marzes for any indicator and year. Projections are available in the Forecast section."
      />

      <div className="mb-6 flex flex-wrap gap-4">
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Indicator</label>
          <select
            value={indicator}
            onChange={(e) => setIndicator(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {REGIONAL_INDICATORS.map((i) => (
              <option key={i.key} value={i.key}>{i.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Year</label>
          <select
            value={year}
            onChange={(e) => setYear(parseInt(e.target.value, 10))}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {[2016, 2017, 2018, 2019, 2020, 2021, 2022].map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {error && (
          <div className="lg:col-span-2">
            <ErrorState message={getErrorMessage(error, 'Unable to load regional rankings.')} />
          </div>
        )}
        {/* Bar chart */}
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">
            {indicatorMeta?.label} — {year}
          </h3>
          <ResponsiveContainer width="100%" height={340}>
            <BarChart
              data={(data ?? []).slice().reverse()}
              layout="vertical"
              margin={{ top: 0, right: 20, left: 80, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
              <XAxis
                type="number"
                tick={{ fontSize: 11, fill: '#94a3b8' }}
                tickLine={false}
                tickFormatter={(v) => v.toFixed(1)}
              />
              <YAxis
                dataKey="marz"
                type="category"
                tick={{ fontSize: 11, fill: '#64748b' }}
                tickLine={false}
                axisLine={false}
                width={78}
              />
              <Tooltip
                contentStyle={CHART_TOOLTIP_CONTENT_STYLE}
                labelStyle={CHART_TOOLTIP_LABEL_STYLE}
                itemStyle={CHART_TOOLTIP_ITEM_STYLE}
                formatter={(v: unknown) => [fmt(Number(v)), indicatorMeta?.label ?? indicator]}
              />
              <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                {(data ?? []).slice().reverse().map((row, i) => (
                  <Cell
                    key={i}
                    fill={
                      row.value === null
                        ? '#e2e8f0'
                        : getIndicatorColor(
                            row.value,
                            minValue,
                            maxValue,
                            indicatorMeta?.colorScheme ?? 'warm'
                          )
                    }
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
                <th className="text-left px-4 py-3 font-medium text-slate-500 w-8">#</th>
                <th className="text-left px-4 py-3 font-medium text-slate-500">Region</th>
                <th className="text-right px-4 py-3 font-medium text-slate-500">{year}</th>
                <th className="text-right px-4 py-3 font-medium text-slate-500">vs {year - 1}</th>
              </tr>
            </thead>
            <tbody>
              {(data ?? []).map((row) => (
                <tr key={row.marz} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="px-4 py-2.5 text-slate-400 tabular-nums">{row.rank}</td>
                  <td className="px-4 py-2.5 font-medium text-slate-900">{row.marz}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-700">
                    {fmt(row.value)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    <span
                      className={
                        row.change === null
                          ? 'text-slate-400'
                          : row.change > 0
                          ? 'text-rose-500'
                          : 'text-emerald-500'
                      }
                    >
                      {changeArrow(row.change)}{' '}
                      {row.change !== null ? Math.abs(row.change).toFixed(2) : ''}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
