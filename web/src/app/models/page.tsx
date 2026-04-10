import PageHeader from '@/components/layout/PageHeader';
import { getModelMetrics } from '@/lib/db';
import { formatAMD } from '@/lib/utils';
import { MODEL_LABELS, MODEL_COLORS } from '@/lib/constants';
import ModelComparisonClient from './ModelComparisonClient';

export const dynamic = 'force-dynamic';

export default async function ModelsPage() {
  let metrics;
  try {
    console.log('[page/models] fetching DB data…');
    metrics = await getModelMetrics();
    console.log('[page/models] DB data fetched OK');
  } catch (err) {
    const e = err as Error & { code?: string; detail?: string };
    console.error('[page/models] DB error:', {
      message: e?.message,
      code: e?.code,
      detail: e?.detail,
      stack: e?.stack,
    });
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6">
        <h2 className="font-semibold text-red-900 mb-2">Database error</h2>
        <pre className="text-sm text-red-700 whitespace-pre-wrap overflow-auto">
          {e?.message}
          {e?.code ? `\ncode: ${e.code}` : ''}
          {e?.detail ? `\ndetail: ${e.detail}` : ''}
        </pre>
        <p className="mt-3 text-xs text-red-500">Check Vercel Runtime Logs and /api/debug/env for details.</p>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="ML Model Comparison"
        subtitle="5 models trained on ILCS 2015 household data to predict household income. Bayesian optimization via Optuna (20 trials, 5-fold CV)."
      />

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
