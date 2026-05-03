import PageHeader from '@/components/layout/PageHeader';
import { getModelMetrics } from '@/lib/csv-data';
import { formatAMD } from '@/lib/utils';
import { MODEL_LABELS, MODEL_COLORS } from '@/lib/constants';
import ModelComparisonClient from './ModelComparisonClient';

export const dynamic = 'force-dynamic';

export default async function ModelsPage() {
  const metrics = await getModelMetrics();

  return (
    <div>
      <PageHeader
        title="Household Income Model"
        subtitle="5 models trained on ILCS 2015 household microdata (5,184 households) to predict household income using 28 survey features. Bayesian optimization via Optuna (20 trials, 5-fold CV)."
      />

      <div className="mb-6 rounded-xl border border-amber-100 bg-amber-50 p-4 flex items-start gap-3">
        <span className="mt-0.5 shrink-0 text-amber-600">ℹ</span>
        <p className="text-sm text-amber-800 leading-relaxed">
          This page benchmarks household income prediction from ILCS 2015 survey data — a micro-level
          cross-sectional result. The primary forecast evidence — Ridge AR models tested against actual 2022
          regional outcomes — is on the{' '}
          <a href="/models/validation" className="underline font-medium">2022 Validation page</a>.
        </p>
      </div>

      {/* Metrics table */}
      <div className="mb-6 rounded-xl border border-slate-200 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              <th className="text-left px-5 py-3 font-medium text-slate-500">Model</th>
              <th className="text-right px-5 py-3 font-medium text-slate-500">Test R²</th>
              <th className="text-right px-5 py-3 font-medium text-slate-500">MAE</th>
              <th className="text-right px-5 py-3 font-medium text-slate-500">RMSE</th>
              <th className="text-right px-5 py-3 font-medium text-slate-500">Optimized</th>
            </tr>
          </thead>
          <tbody>
            {metrics.map((m, i) => (
              <tr key={m.model} className="border-b border-slate-50 hover:bg-slate-50">
                <td className="px-5 py-3 font-medium text-slate-900">
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-block w-3 h-3 rounded-full"
                      style={{ background: MODEL_COLORS[m.model] ?? '#94a3b8' }}
                    />
                    {MODEL_LABELS[m.model] ?? m.model.toUpperCase()}
                    {i === 0 && (
                      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700">BEST</span>
                    )}
                  </div>
                </td>
                <td className="px-5 py-3 text-right tabular-nums font-medium text-slate-700">
                  {m.r2.toFixed(4)}
                </td>
                <td className="px-5 py-3 text-right tabular-nums text-slate-600">
                  {formatAMD(Math.round(m.mae), true)}
                </td>
                <td className="px-5 py-3 text-right tabular-nums text-slate-600">
                  {formatAMD(Math.round(m.rmse), true)}
                </td>
                <td className="px-5 py-3 text-right">
                  {m.is_bayesian_optimized ? (
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">Yes</span>
                  ) : (
                    <span className="text-xs text-slate-400">No</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Bar chart comparison */}
      <ModelComparisonClient metrics={metrics} />

      {/* Interpretation note */}
      <div className="mt-6 rounded-xl border border-blue-100 bg-blue-50 p-5">
        <h3 className="text-sm font-semibold text-blue-900 mb-2">Interpreting R² ≈ 0.35</h3>
        <p className="text-sm text-blue-700 leading-relaxed">
          Household income has extremely high variance (CV = 0.98). An R² of 0.35 means the model
          explains 35% of that variance using only 28 survey features — comparable to published
          results on similar datasets. The dominant predictor is{' '}
          <strong>income source count</strong> (importance 0.19–0.32 across all models).
          Spending proxies (services_goods, food) outperform housing and asset variables.
        </p>
      </div>
    </div>
  );
}
