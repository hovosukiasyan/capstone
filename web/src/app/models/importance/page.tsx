'use client';

import { useState } from 'react';
import useSWR from 'swr';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import ErrorState from '@/components/layout/ErrorState';
import PageHeader from '@/components/layout/PageHeader';
import { MODEL_LABELS, MODEL_COLORS, HOUSEHOLD_COLUMN_MAP } from '@/lib/constants';
import { apiFetcher, getErrorMessage } from '@/lib/fetcher';
import type { FeatureImportance } from '@/lib/types';
const MODELS = ['gbm', 'rf', 'et', 'ridge', 'lasso'] as const;

export default function FeatureImportancePage() {
  const [model, setModel] = useState<string>('gbm');
  const [compareModel, setCompareModel] = useState<string | null>(null);
  const [topN, setTopN] = useState(15);

  const { data, error } = useSWR<FeatureImportance[]>(
    `/api/models/importance?model=${model}&top_n=${topN}`,
    apiFetcher
  );
  const { data: compareData, error: compareError } = useSWR<FeatureImportance[]>(
    compareModel ? `/api/models/importance?model=${compareModel}&top_n=${topN}` : null,
    apiFetcher
  );

  const labelFor = (feat: string) => HOUSEHOLD_COLUMN_MAP.get(feat as keyof import('@/lib/types').Household)?.label ?? feat;

  // Normalize importance for ridge/lasso (use abs, then divide by max)
  const normalize = (rows: FeatureImportance[]) => {
    const maxVal = Math.max(...rows.map((r) => Math.abs(r.importance)));
    return rows.map((r) => ({ ...r, importance: maxVal > 0 ? Math.abs(r.importance) / maxVal : 0 }));
  };

  const mainData = data ? normalize(data) : [];
  const isLinear = ['ridge', 'lasso'].includes(model);

  return (
    <div>
      <PageHeader
        title="Feature Importance"
        subtitle="Which features most strongly predict household income? Compare across models."
      />

      {/* Model tabs */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-slate-200 overflow-hidden text-sm">
          {MODELS.map((m) => (
            <button
              key={m}
              onClick={() => setModel(m)}
              className={`px-4 py-1.5 font-medium transition-colors ${
                model === m ? 'text-white' : 'bg-white text-slate-600 hover:bg-slate-50'
              }`}
              style={model === m ? { background: MODEL_COLORS[m] } : {}}
            >
              {m.toUpperCase()}
            </button>
          ))}
        </div>

        {/* Compare toggle */}
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-slate-500">Compare with:</span>
          <select
            value={compareModel ?? ''}
            onChange={(e) => setCompareModel(e.target.value || null)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700"
          >
            <option value="">None</option>
            {MODELS.filter((m) => m !== model).map((m) => (
              <option key={m} value={m}>{MODEL_LABELS[m]}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">Top</span>
          <input
            type="range" min={5} max={27} step={1} value={topN}
            onChange={(e) => setTopN(parseInt(e.target.value, 10))}
            className="w-24"
          />
          <span className="text-xs text-slate-500 w-4">{topN}</span>
        </div>
      </div>

      {isLinear && (
        <div className="mb-4 rounded-lg bg-amber-50 border border-amber-100 px-4 py-2 text-xs text-amber-700">
          Ridge/Lasso importances are absolute coefficient values (normalized to [0,1] for comparison).
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-6">
        {error ? (
          <ErrorState message={getErrorMessage(error, 'Unable to load feature importances.')} />
        ) : !data ? (
          <div className="flex items-center justify-center h-80 text-slate-400">Loading...</div>
        ) : compareModel && compareError ? (
          <ErrorState message={getErrorMessage(compareError, 'Unable to load comparison model importances.')} />
        ) : compareModel && compareData ? (
          /* Mirrored comparison chart */
          <div>
            <div className="flex justify-between text-xs font-medium mb-2">
              <span style={{ color: MODEL_COLORS[model] }}>{MODEL_LABELS[model]}</span>
              <span style={{ color: MODEL_COLORS[compareModel] }}>{MODEL_LABELS[compareModel]}</span>
            </div>
            <div className="space-y-1">
              {mainData.map((item) => {
                const cmpItem = compareData.find((c) => c.feature === item.feature);
                const cmpVal = cmpItem ? Math.abs(cmpItem.importance) / Math.max(...compareData.map((r) => Math.abs(r.importance))) : 0;
                return (
                  <div key={item.feature} className="flex items-center gap-2">
                    {/* Left bar */}
                    <div className="flex-1 flex justify-end">
                      <div
                        className="h-5 rounded-l transition-all"
                        style={{ width: `${item.importance * 100}%`, background: MODEL_COLORS[model] }}
                      />
                    </div>
                    {/* Label */}
                    <div className="w-44 text-center text-xs text-slate-600 shrink-0">
                      {labelFor(item.feature)}
                    </div>
                    {/* Right bar */}
                    <div className="flex-1">
                      <div
                        className="h-5 rounded-r transition-all"
                        style={{ width: `${cmpVal * 100}%`, background: MODEL_COLORS[compareModel] ?? '#94a3b8' }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          /* Single model horizontal bars */
          <ResponsiveContainer width="100%" height={Math.max(300, topN * 26)}>
            <BarChart
              data={mainData.map((d) => ({ ...d, label: labelFor(d.feature) }))}
              layout="vertical"
              margin={{ top: 0, right: 30, left: 160, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
              <XAxis
                type="number"
                tick={{ fontSize: 11, fill: '#94a3b8' }}
                tickLine={false}
                tickFormatter={(v) => v.toFixed(2)}
              />
              <YAxis
                dataKey="label"
                type="category"
                tick={{ fontSize: 11, fill: '#64748b' }}
                tickLine={false}
                axisLine={false}
                width={155}
              />
              <Tooltip
                contentStyle={{ background: '#1e293b', border: 'none', borderRadius: 8, fontSize: 12, color: '#f1f5f9' }}
                formatter={(v: unknown) => [
                  Number(v).toFixed(4),
                  isLinear ? 'Normalized coeff.' : 'Importance',
                ]}
              />
              <Bar dataKey="importance" radius={[0, 4, 4, 0]}>
                {mainData.map((_, i) => (
                  <Cell
                    key={i}
                    fill={MODEL_COLORS[model] ?? '#3b82f6'}
                    fillOpacity={1 - i * 0.025}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
