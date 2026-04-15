'use client';

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import {
  CHART_TOOLTIP_CONTENT_STYLE,
  CHART_TOOLTIP_ITEM_STYLE,
  CHART_TOOLTIP_LABEL_STYLE,
  formatAMD,
} from '@/lib/utils';
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

  const safeLog = (v: number) => (v > 0 ? Math.log10(v) : null);
  const medianX = logScale ? safeLog(stats.median) : stats.median;
  const meanX = logScale ? safeLog(stats.mean) : stats.mean;

  const tickFormatter = logScale
    ? (v: number) => formatAMD(Math.pow(10, v), true)
    : (v: number) => formatAMD(v, true);

  const medianLabel = logScale ? formatAMD(stats.median, true) : formatAMD(stats.median, true);
  const meanLabel = logScale ? formatAMD(stats.mean, true) : formatAMD(stats.mean, true);

  // Determine if labels would collide (within 8% of chart range)
  const range = xMax - xMin;
  const tooClose = medianX !== null && meanX !== null && Math.abs(meanX - medianX) < range * 0.08;

  return (
    <div>
      <ResponsiveContainer width="100%" height={260}>
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
            contentStyle={CHART_TOOLTIP_CONTENT_STYLE}
            labelStyle={CHART_TOOLTIP_LABEL_STYLE}
            itemStyle={CHART_TOOLTIP_ITEM_STYLE}
            formatter={(value: unknown, _name: unknown, props: { payload?: { x0?: number; x1?: number } }) => {
              const lo = formatAMD(props.payload?.x0 ?? 0, true);
              const hi = formatAMD(props.payload?.x1 ?? 0, true);
              return [`${value} households`, `${lo} – ${hi}`];
            }}
            labelFormatter={() => ''}
          />
          <Bar dataKey="count" fill={color} radius={[2, 2, 0, 0]} maxBarSize={20} />
          {/* Median line — no inline label to avoid collision */}
          {medianX !== null && (
            <ReferenceLine
              x={medianX}
              stroke="#10b981"
              strokeDasharray="4 4"
              strokeWidth={1.5}
              label={tooClose ? undefined : { value: 'Median', position: 'insideTopLeft', fontSize: 9, fill: '#10b981' }}
            />
          )}
          {/* Mean line */}
          {meanX !== null && (
            <ReferenceLine
              x={meanX}
              stroke="#f59e0b"
              strokeDasharray="4 4"
              strokeWidth={1.5}
              label={tooClose ? undefined : { value: 'Mean', position: 'insideTopRight', fontSize: 9, fill: '#f59e0b' }}
            />
          )}
        </BarChart>
      </ResponsiveContainer>
      {/* Always-visible legend row — avoids chart overflow entirely */}
      <div className="flex items-center gap-5 mt-2 text-xs">
        <span className="flex items-center gap-1.5">
          <span style={{ display: 'inline-block', width: 20, borderTop: '2px dashed #10b981' }} />
          <span className="text-slate-600">Median: <strong>{medianLabel}</strong></span>
        </span>
        <span className="flex items-center gap-1.5">
          <span style={{ display: 'inline-block', width: 20, borderTop: '2px dashed #f59e0b' }} />
          <span className="text-slate-600">Mean: <strong>{meanLabel}</strong></span>
        </span>
      </div>
    </div>
  );
}
