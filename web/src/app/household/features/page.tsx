'use client';

import { useState } from 'react';
import useSWR from 'swr';
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ZAxis,
} from 'recharts';
import ErrorState from '@/components/layout/ErrorState';
import PageHeader from '@/components/layout/PageHeader';
import { HOUSEHOLD_COLUMNS } from '@/lib/constants';
import { apiFetcher, getErrorMessage } from '@/lib/fetcher';
import {
  CHART_TOOLTIP_CONTENT_STYLE,
  CHART_TOOLTIP_ITEM_STYLE,
  CHART_TOOLTIP_LABEL_STYLE,
  formatAMD,
} from '@/lib/utils';
import type { ScatterPoint } from '@/lib/types';

const MONETARY_COLS = HOUSEHOLD_COLUMNS.filter((c) =>
  ['monetary', 'count', 'continuous'].includes(c.type)
);

export default function FeaturesPage() {
  const [xCol, setXCol] = useState('food_purchases_total');
  const [yCol, setYCol] = useState('household_income_total');
  const [colorBy, setColorBy] = useState('household_income_source_count');
  const [pMin, setPMin] = useState(1);
  const [pMax, setPMax] = useState(99);

  const url = `/api/households/scatter?x=${xCol}&y=${yCol}&color_by=${colorBy}&p_min=${pMin}&p_max=${pMax}`;
  const { data, error, isLoading } = useSWR<ScatterPoint[]>(url, apiFetcher);

  const xMeta = HOUSEHOLD_COLUMNS.find((c) => c.key === xCol);
  const yMeta = HOUSEHOLD_COLUMNS.find((c) => c.key === yCol);

  const fmtAxis = (meta: typeof xMeta) => (v: number) =>
    meta?.type === 'monetary' ? formatAMD(v, true) : v.toLocaleString();

  const colorValues = (data ?? []).map((p) => p.color_value).filter((v) => v !== null);
  const cMin = colorValues.length ? Math.min(...colorValues) : 0;
  const cMax = colorValues.length ? Math.max(...colorValues) : 1;
  const getColor = (v: number) => {
    const t = cMax === cMin ? 0.5 : (v - cMin) / (cMax - cMin);
    const hue = 240 - t * 200; // blue → red
    return `hsl(${hue}, 70%, 55%)`;
  };

  return (
    <div>
      <PageHeader
        title="Feature Explorer"
        subtitle="Scatter any two variables against each other, colored by a third."
      />

      {/* Controls */}
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3">
        {[
          { label: 'X axis', value: xCol, setter: setXCol },
          { label: 'Y axis', value: yCol, setter: setYCol },
          { label: 'Color by', value: colorBy, setter: setColorBy },
        ].map(({ label, value, setter }) => (
          <div key={label}>
            <label className="block text-xs font-medium text-slate-500 mb-1">{label}</label>
            <select
              value={value}
              onChange={(e) => setter(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {MONETARY_COLS.map((col) => (
                <option key={col.key} value={col.key}>{col.label}</option>
              ))}
            </select>
          </div>
        ))}
      </div>

      {/* Percentile trim */}
      <div className="mb-6 flex items-center gap-6 rounded-xl border border-slate-200 bg-white px-6 py-4">
        <span className="text-xs font-medium text-slate-500">Trim outliers:</span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">P{pMin}</span>
          <input type="range" min={0} max={10} value={pMin} onChange={(e) => setPMin(parseInt(e.target.value, 10))} className="w-24" />
        </div>
        <div className="flex items-center gap-2">
          <input type="range" min={90} max={100} value={pMax} onChange={(e) => setPMax(parseInt(e.target.value, 10))} className="w-24" />
          <span className="text-xs text-slate-400">P{pMax}</span>
        </div>
        <span className="ml-auto text-xs text-slate-400">{data?.length ?? '…'} points shown</span>
      </div>

      {/* Chart */}
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        {isLoading && (
          <div className="flex items-center justify-center h-80 text-slate-400">Loading scatter...</div>
        )}
        {!isLoading && error && (
          <ErrorState message={getErrorMessage(error, 'Unable to load scatter data.')} />
        )}
        {!isLoading && data && (
          <ResponsiveContainer width="100%" height={420}>
            <ScatterChart margin={{ top: 10, right: 20, left: 10, bottom: 30 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis
                type="number"
                dataKey="x"
                name={xMeta?.label}
                tick={{ fontSize: 10, fill: '#94a3b8' }}
                tickLine={false}
                tickFormatter={fmtAxis(xMeta)}
                label={{ value: xMeta?.label ?? xCol, position: 'insideBottom', offset: -20, fontSize: 11, fill: '#94a3b8' }}
              />
              <YAxis
                type="number"
                dataKey="y"
                name={yMeta?.label}
                tick={{ fontSize: 10, fill: '#94a3b8' }}
                tickLine={false}
                axisLine={false}
                tickFormatter={fmtAxis(yMeta)}
                label={{ value: yMeta?.label ?? yCol, angle: -90, position: 'insideLeft', fontSize: 11, fill: '#94a3b8' }}
              />
              <ZAxis range={[12, 12]} />
              <Tooltip
                contentStyle={CHART_TOOLTIP_CONTENT_STYLE}
                labelStyle={CHART_TOOLTIP_LABEL_STYLE}
                itemStyle={CHART_TOOLTIP_ITEM_STYLE}
                cursor={{ strokeDasharray: '3 3' }}
                formatter={(value: unknown, name: unknown) => {
                const v = Number(value);
                const n = String(name);
                return [
                  n === xMeta?.label && xMeta?.type === 'monetary'
                    ? formatAMD(v, true)
                    : n === yMeta?.label && yMeta?.type === 'monetary'
                    ? formatAMD(v, true)
                    : v.toFixed(2),
                  n,
                ];
              }}
              />
              <Scatter
                data={data}
                fill="#3b82f6"
                fillOpacity={0.5}
                shape={(props: { cx?: number; cy?: number; payload?: ScatterPoint }) => (
                  <circle
                    cx={props.cx}
                    cy={props.cy}
                    r={3}
                    fill={getColor(props.payload?.color_value ?? 0)}
                    fillOpacity={0.6}
                  />
                )}
              />
            </ScatterChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Color legend */}
      {data && data.length > 0 && (
        <div className="mt-3 flex items-center gap-3 text-xs text-slate-500">
          <span>Color: {HOUSEHOLD_COLUMNS.find((c) => c.key === colorBy)?.label}</span>
          <div className="flex items-center gap-1">
            <div className="w-20 h-2.5 rounded" style={{ background: 'linear-gradient(to right, hsl(240,70%,55%), hsl(40,70%,55%))' }} />
            <span>{cMin.toFixed(1)}</span>
            <span>→</span>
            <span>{cMax.toFixed(1)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
