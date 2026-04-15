'use client';

import { useState } from 'react';
import useSWR from 'swr';
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ZAxis,
} from 'recharts';
import ErrorState from '@/components/layout/ErrorState';
import PageHeader from '@/components/layout/PageHeader';
import { apiFetcher, getErrorMessage } from '@/lib/fetcher';
import {
  CHART_TOOLTIP_CONTENT_STYLE,
  CHART_TOOLTIP_ITEM_STYLE,
  CHART_TOOLTIP_LABEL_STYLE,
  formatAMD,
} from '@/lib/utils';
import type { TsnePoint } from '@/lib/types';

const CLUSTER_COLORS = [
  '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6',
  '#ec4899', '#06b6d4', '#84cc16',
];

const DECILE_COLORS = [
  '#dbeafe', '#bfdbfe', '#93c5fd', '#60a5fa', '#3b82f6',
  '#2563eb', '#1d4ed8', '#1e40af', '#1e3a8a', '#172554',
];

type ColorMode = 'cluster' | 'income_decile';

function DecileLegend({
  items,
  colorMode,
}: {
  items: { key: number; color: string }[];
  colorMode: ColorMode;
}) {
  return (
    <div className="mb-4 flex flex-wrap gap-2">
      {items.map(({ key, color }) => (
        <div
          key={`${colorMode}-${key}`}
          className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs"
          style={{
            borderColor: 'var(--border-subtle)',
            background: 'var(--surface-raised)',
            color: 'var(--text-secondary)',
          }}
        >
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{ background: color, display: 'inline-block' }}
          />
          <span>{colorMode === 'cluster' ? `Cluster ${key}` : `Decile ${key}`}</span>
        </div>
      ))}
    </div>
  );
}

export default function TsnePage() {
  const [colorMode, setColorMode] = useState<ColorMode>('cluster');
  const { data, error, isLoading } = useSWR<TsnePoint[]>('/api/households/tsne', apiFetcher);

  const hasData = data && data.length > 0;
  const hasTsne = hasData && data[0].x !== null;

  if (!hasTsne && !isLoading) {
    return (
      <div>
        <PageHeader title="t-SNE Cluster Scatter" />
        {error ? (
          <ErrorState message={getErrorMessage(error, 'Unable to load t-SNE points.')} />
        ) : (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-amber-800">
          <h3 className="font-semibold mb-2">t-SNE coordinates not yet generated</h3>
          <p className="text-sm mb-3">
            To enable this visualization, export t-SNE coordinates from the notebook:
          </p>
          <ol className="text-sm space-y-1 list-decimal list-inside text-amber-700">
            <li>Open <code className="bg-amber-100 px-1 rounded">notebooks/ilcs_tsne_clustering.ipynb</code></li>
            <li>Run all cells</li>
            <li>The last cell exports <code className="bg-amber-100 px-1 rounded">data/ilcs/research/tsne_coords.csv</code></li>
            <li>Re-run <code className="bg-amber-100 px-1 rounded">npx tsx scripts/seed.ts</code></li>
          </ol>
        </div>
        )}
      </div>
    );
  }

  // Group by color dimension
  const groups = new Map<number, TsnePoint[]>();
  for (const p of data ?? []) {
    const key = colorMode === 'cluster' ? (p.cluster ?? 0) : (p.income_decile ?? 0);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(p);
  }

  const getColor = (key: number) =>
    colorMode === 'cluster'
      ? CLUSTER_COLORS[key % CLUSTER_COLORS.length]
      : DECILE_COLORS[Math.max(0, Math.min(key - 1, 9))];

  const legendItems = Array.from(groups.keys())
    .sort((a, b) => a - b)
    .map((key) => ({ key, color: getColor(key) }));

  return (
    <div>
      <PageHeader
        title="t-SNE Cluster Scatter"
        subtitle="5,184 households reduced to 2D. Each point is a household."
      />

      <div className="mb-4 flex items-center gap-4">
        <div className="flex rounded-lg border border-slate-200 overflow-hidden text-sm">
          {(['cluster', 'income_decile'] as ColorMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => setColorMode(mode)}
              className={`px-4 py-1.5 font-medium transition-colors ${
                colorMode === mode
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              {mode === 'cluster' ? 'By K-Means Cluster' : 'By Income Decile'}
            </button>
          ))}
        </div>
        {isLoading && <span className="text-sm text-slate-400">Loading...</span>}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <DecileLegend items={legendItems} colorMode={colorMode} />
        <ResponsiveContainer width="100%" height={500}>
          <ScatterChart margin={{ top: 10, right: 20, left: 10, bottom: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f8fafc" />
            <XAxis
              type="number"
              dataKey="x"
              tick={{ fontSize: 10, fill: '#94a3b8' }}
              tickLine={false}
              name="t-SNE 1"
            />
            <YAxis
              type="number"
              dataKey="y"
              tick={{ fontSize: 10, fill: '#94a3b8' }}
              tickLine={false}
              axisLine={false}
              name="t-SNE 2"
            />
            <ZAxis range={[15, 15]} />
            <Tooltip
              contentStyle={{ ...CHART_TOOLTIP_CONTENT_STYLE, fontSize: 11 }}
              labelStyle={CHART_TOOLTIP_LABEL_STYLE}
              itemStyle={CHART_TOOLTIP_ITEM_STYLE}
              cursor={false}
              formatter={(v: unknown, name: unknown) => {
                if (name === 'household_income_total') return [formatAMD(Number(v), true), 'Income'];
                if (name === 'household_size') return [String(v), 'HH Size'];
                return [String(v), String(name)];
              }}
            />
            {Array.from(groups.entries())
              .sort(([a], [b]) => a - b)
              .map(([key, points]) => (
                <Scatter
                  key={key}
                  name={
                    colorMode === 'cluster'
                      ? `Cluster ${key}`
                      : `Decile ${key}`
                  }
                  data={points}
                  fill={getColor(key)}
                  fillOpacity={0.5}
                  shape={(props: { cx?: number; cy?: number }) => (
                    <circle cx={props.cx} cy={props.cy} r={2.5} fill={getColor(key)} fillOpacity={0.55} />
                  )}
                />
              ))}
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      {colorMode === 'cluster' && (
        <p className="mt-3 text-xs text-slate-400">
          Clusters computed with K-Means on hybrid-scaled features (mixed numeric and binary variables, normalized per type).
        </p>
      )}
    </div>
  );
}
