'use client';

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { formatAMD, MONTH_NAMES } from '@/lib/utils';

interface DataPoint {
  month: number;
  mean_income: number;
  count: number;
}

interface Props {
  data: DataPoint[];
}

export default function SeasonalBar({ data }: Props) {
  const chartData = data.map((d) => ({
    month: MONTH_NAMES[d.month - 1] ?? String(d.month),
    income: Math.round(d.mean_income),
    count: d.count,
  }));

  const avg = chartData.reduce((s, d) => s + d.income, 0) / (chartData.length || 1);

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
        <XAxis
          dataKey="month"
          tick={{ fontSize: 11, fill: '#94a3b8' }}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 10, fill: '#94a3b8' }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => formatAMD(v, true)}
        />
        <Tooltip
          contentStyle={{
            background: '#1e293b',
            border: 'none',
            borderRadius: 8,
            fontSize: 12,
            color: '#f1f5f9',
          }}
          formatter={(v: unknown) => [formatAMD(Number(v)), 'Mean income']}
        />
        <Bar
          dataKey="income"
          fill="#3b82f6"
          radius={[4, 4, 0, 0]}
          // Color bars above/below average differently
          label={false}
        />
        {/* Reference line for overall mean */}
        {avg > 0 && (
          <line
            x1="0" x2="100%" y1={avg} y2={avg}
            stroke="#94a3b8"
            strokeDasharray="4 4"
          />
        )}
      </BarChart>
    </ResponsiveContainer>
  );
}
