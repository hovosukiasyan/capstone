'use client';

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, Cell,
} from 'recharts';
import { MODEL_LABELS, MODEL_COLORS } from '@/lib/constants';
import type { ModelMetrics } from '@/lib/types';

interface Props {
  metrics: ModelMetrics[];
}

export default function ModelComparisonClient({ metrics }: Props) {
  const r2Data = metrics.map((m) => ({
    name: m.model.toUpperCase(),
    R2: parseFloat(m.r2.toFixed(4)),
    color: MODEL_COLORS[m.model] ?? '#94a3b8',
  }));

  const maeData = metrics.map((m) => ({
    name: m.model.toUpperCase(),
    MAE: Math.round(m.mae),
    color: MODEL_COLORS[m.model] ?? '#94a3b8',
  }));

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
      {/* R² chart */}
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <h3 className="text-sm font-semibold text-slate-700 mb-4">Test R² (higher is better)</h3>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={r2Data} margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} />
            <YAxis
              domain={[0.28, 0.38]}
              tick={{ fontSize: 11, fill: '#94a3b8' }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => v.toFixed(2)}
            />
            <Tooltip
              contentStyle={{ background: '#1e293b', border: 'none', borderRadius: 8, fontSize: 12, color: '#f1f5f9' }}
              formatter={(v: unknown) => [Number(v).toFixed(4), 'R²']}
            />
            <Bar dataKey="R2" radius={[4, 4, 0, 0]}>
              {r2Data.map((d) => <Cell key={d.name} fill={d.color} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* MAE chart */}
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <h3 className="text-sm font-semibold text-slate-700 mb-4">MAE in AMD (lower is better)</h3>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={maeData} margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} />
            <YAxis
              tick={{ fontSize: 11, fill: '#94a3b8' }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `${(v / 1000).toFixed(0)}K`}
            />
            <Tooltip
              contentStyle={{ background: '#1e293b', border: 'none', borderRadius: 8, fontSize: 12, color: '#f1f5f9' }}
              formatter={(v: unknown) => [`${Number(v).toLocaleString()} ֏`, 'MAE']}
            />
            <Bar dataKey="MAE" radius={[4, 4, 0, 0]}>
              {maeData.map((d) => <Cell key={d.name} fill={d.color} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
