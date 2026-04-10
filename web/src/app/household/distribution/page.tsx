'use client';

import { useState } from 'react';
import useSWR from 'swr';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import IncomeHistogram from '@/components/charts/IncomeHistogram';
import ErrorState from '@/components/layout/ErrorState';
import PageHeader from '@/components/layout/PageHeader';
import { HOUSEHOLD_COLUMNS, ORDINAL_LABELS } from '@/lib/constants';
import { apiFetcher, getErrorMessage } from '@/lib/fetcher';
import { decodeLabel, formatAMD } from '@/lib/utils';
import type { DistributionResponse } from '@/lib/types';

export default function DistributionPage() {
  const [column, setColumn] = useState('household_income_total');
  const [logScale, setLogScale] = useState(true);
  const [bins, setBins] = useState(50);

  const colMeta = HOUSEHOLD_COLUMNS.find((c) => c.key === column);
  const { data, error, isLoading } = useSWR<DistributionResponse>(
    `/api/households/distribution?column=${column}&bins=${bins}`,
    apiFetcher
  );

  const isBinaryOrOrdinal = colMeta?.type === 'binary' || colMeta?.type === 'ordinal';
  const isMonetary = colMeta?.type === 'monetary';

  return (
    <div>
      <PageHeader
        title="Column Distributions"
        subtitle="Explore the distribution of any household variable."
      />

      {/* Controls */}
      <div className="mb-6 flex flex-wrap items-end gap-4">
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Variable</label>
          <select
            value={column}
            onChange={(e) => {
              setColumn(e.target.value);
              const meta = HOUSEHOLD_COLUMNS.find((c) => c.key === e.target.value);
              setLogScale(meta?.type === 'monetary');
            }}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-56"
          >
            {HOUSEHOLD_COLUMNS.map((col) => (
              <option key={col.key} value={col.key}>
                {col.label}
              </option>
            ))}
          </select>
        </div>

        {!isBinaryOrOrdinal && (
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Bins</label>
            <input
              type="range"
              min={10}
              max={100}
              step={5}
              value={bins}
              onChange={(e) => setBins(parseInt(e.target.value, 10))}
              className="w-32"
            />
            <span className="ml-2 text-xs text-slate-500">{bins}</span>
          </div>
        )}

        {isMonetary && (
          <label className="flex items-center gap-2 text-xs text-slate-500 cursor-pointer pb-1.5">
            <input
              type="checkbox"
              checked={logScale}
              onChange={(e) => setLogScale(e.target.checked)}
              className="rounded"
            />
            Log scale
          </label>
        )}
      </div>

      {/* Description */}
      {colMeta && (
        <div className="mb-4 rounded-lg bg-blue-50 border border-blue-100 px-4 py-3">
          <p className="text-sm text-blue-800 font-medium">{colMeta.label}</p>
          <p className="text-xs text-blue-600 mt-0.5">{colMeta.description}</p>
          {colMeta.type === 'binary' && (
            <p className="text-xs text-blue-500 mt-1">Note: coded 1=Yes, 2=No in survey</p>
          )}
        </div>
      )}

      {/* Chart */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 mb-6">
        {isLoading && (
          <div className="flex items-center justify-center h-64 text-slate-400">Loading...</div>
        )}
        {!isLoading && error && (
          <ErrorState message={getErrorMessage(error, 'Unable to load distribution data.')} />
        )}
        {!isLoading && data && (
          <>
            {isBinaryOrOrdinal ? (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart
                  data={data.bins.map((b) => ({
                    label: decodeLabel(column, b.x0),
                    count: b.count,
                    pct: ((b.count / data.stats.count) * 100).toFixed(1),
                  }))}
                  margin={{ top: 10, right: 20, left: 20, bottom: 10 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#94a3b8' }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      background: '#1e293b',
                      border: 'none',
                      borderRadius: 8,
                      fontSize: 12,
                      color: '#f1f5f9',
                    }}
                    formatter={(v: unknown, _n: unknown, props: { payload?: { pct?: string } }) => [
                      `${v} (${props.payload?.pct ?? ''}%)`,
                      'Count',
                    ]}
                  />
                  <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <IncomeHistogram
                bins={data.bins}
                stats={data.stats}
                logScale={logScale}
                color={isMonetary ? '#3b82f6' : '#8b5cf6'}
              />
            )}
          </>
        )}
      </div>

      {/* Stats table */}
      {data && !isBinaryOrOrdinal && (
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">Statistics</h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: 'Count', value: data.stats.count.toLocaleString() },
              { label: 'Mean', value: isMonetary ? formatAMD(Math.round(data.stats.mean), true) : data.stats.mean.toFixed(2) },
              { label: 'Median', value: isMonetary ? formatAMD(Math.round(data.stats.median), true) : data.stats.median.toFixed(2) },
              { label: 'Std Dev', value: isMonetary ? formatAMD(Math.round(data.stats.std), true) : data.stats.std.toFixed(2) },
              { label: 'P10', value: isMonetary ? formatAMD(Math.round(data.stats.p10), true) : data.stats.p10.toFixed(2) },
              { label: 'P90', value: isMonetary ? formatAMD(Math.round(data.stats.p90), true) : data.stats.p90.toFixed(2) },
              { label: 'Min', value: isMonetary ? formatAMD(Math.round(data.stats.min), true) : data.stats.min.toFixed(2) },
              { label: 'Max', value: isMonetary ? formatAMD(Math.round(data.stats.max), true) : data.stats.max.toFixed(2) },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-lg bg-slate-50 px-3 py-2">
                <div className="text-xs text-slate-400">{label}</div>
                <div className="text-sm font-medium text-slate-700 tabular-nums">{value}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
