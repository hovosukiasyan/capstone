'use client';

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { formatAMD } from '@/lib/utils';
import type { HistogramBucket, DistributionStats } from '@/lib/types';

interface Props {
  bins: HistogramBucket[];
  stats: DistributionStats;
  logScale?: boolean;
  color?: string;
}

export default function IncomeHistogram({ bins, stats, logScale = true, color = '#3b82f6' }: Props) {
  const chartData = bins.map((b) => ({
    x: logScale ? Math.log10((b.x0 + b.x1) / 2) : (b.x0 + b.x1) / 2,
    x0: b.x0,
    x1: b.x1,
    count: b.count,
  }));

  const xMin = chartData[0]?.x ?? 0;
  const xMax = chartData[chartData.length - 1]?.x ?? 1;
  const medianX = logScale ? Math.log10(stats.median) : stats.median;
  const meanX = logScale ? Math.log10(stats.mean) : stats.mean;

  const tickFormatter = logScale
    ? (v: number) => formatAMD(Math.pow(10, v), true)
    : (v: number) => formatAMD(v, true);

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 30 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
        <XAxis
          dataKey="x"
          type="number"
          domain={[xMin, xMax]}
          tick={{ fontSize: 10, fill: '#94a3b8' }}
          tickLine={false}
          tickFormatter={tickFormatter}
          label={{ value: logScale ? 'Income (AMD, log scale)' : 'Income (AMD)', position: 'insideBottom', offset: -20, fontSize: 11, fill: '#94a3b8' }}
        />
        <YAxis
          tick={{ fontSize: 11, fill: '#94a3b8' }}
          tickLine={false}
          axisLine={false}
          label={{ value: 'Households', angle: -90, position: 'insideLeft', fontSize: 11, fill: '#94a3b8' }}
        />
        <Tooltip
          contentStyle={{
            background: '#1e293b',
            border: 'none',
            borderRadius: 8,
            fontSize: 12,
            color: '#f1f5f9',
          }}
          formatter={(value: unknown, _name: unknown, props: { payload?: { x0?: number; x1?: number } }) => {
            const lo = formatAMD(props.payload?.x0 ?? 0, true);
            const hi = formatAMD(props.payload?.x1 ?? 0, true);
            return [`${value} households`, `${lo} – ${hi}`];
          }}
          labelFormatter={() => ''}
        />
        <Bar dataKey="count" fill={color} radius={[2, 2, 0, 0]} maxBarSize={20} />
        {/* Median line */}
        <ReferenceLine
          x={medianX}
          stroke="#10b981"
          strokeDasharray="4 4"
          label={{ value: 'Median', position: 'top', fontSize: 10, fill: '#10b981' }}
        />
        {/* Mean line */}
        <ReferenceLine
          x={meanX}
          stroke="#f59e0b"
          strokeDasharray="4 4"
          label={{ value: 'Mean', position: 'top', fontSize: 10, fill: '#f59e0b' }}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
