'use client';

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { MARZ_NAMES } from '@/lib/constants';
import {
  CHART_TOOLTIP_CONTENT_STYLE,
  CHART_TOOLTIP_ITEM_STYLE,
  CHART_TOOLTIP_LABEL_STYLE,
} from '@/lib/utils';

const MARZ_COLORS = [
  '#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6',
  '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1', '#14b8a6',
];

export interface RegionalTimeSeriesPoint {
  date: string;
  marz: string;
  value: number;
}

interface Props {
  data: RegionalTimeSeriesPoint[];
  marzes: string[];
  indicatorLabel: string;
  nationalAvg?: number | null;
}

export default function RegionalTimeSeries({ data, marzes, indicatorLabel, nationalAvg }: Props) {
  // Pivot: date → { marz: value }
  const byDate = new Map<string, Record<string, number>>();
  for (const row of data) {
    if (!byDate.has(row.date)) byDate.set(row.date, {});
    byDate.get(row.date)![row.marz] = row.value;
  }
  const chartData = Array.from(byDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, vals]) => ({ date: date.slice(0, 7), ...vals }));

  if (chartData.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400">
        No data available for the selected filters.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={360}>
      <LineChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 11, fill: '#94a3b8' }}
          tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fontSize: 11, fill: '#94a3b8' }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => v.toFixed(1)}
        />
        <Tooltip
          contentStyle={CHART_TOOLTIP_CONTENT_STYLE}
          labelStyle={CHART_TOOLTIP_LABEL_STYLE}
          itemStyle={CHART_TOOLTIP_ITEM_STYLE}
          formatter={(value: unknown, name: unknown) => [(Number(value)).toFixed(2), String(name)]}
        />
        <Legend />
        {nationalAvg && (
          <ReferenceLine
            y={nationalAvg}
            stroke="#94a3b8"
            strokeDasharray="4 4"
            label={{ value: 'National avg', position: 'insideTopRight', fontSize: 10, fill: '#94a3b8' }}
          />
        )}
        {marzes.map((marz, i) => (
          <Line
            key={marz}
            type="monotone"
            dataKey={marz}
            name={marz}
            stroke={MARZ_COLORS[MARZ_NAMES.indexOf(marz as typeof MARZ_NAMES[number]) % MARZ_COLORS.length] || MARZ_COLORS[i % MARZ_COLORS.length]}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
