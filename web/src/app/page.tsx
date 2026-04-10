import Link from 'next/link';
import KpiCard from '@/components/cards/KpiCard';
import { getHouseholdStats, getModelMetrics, getRegionalYears } from '@/lib/db';
import { formatAMD } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const SECTION_CARDS = [
  {
    href: '/household',
    title: 'Household Analysis',
    description:
      'Explore income distributions, seasonal patterns, feature correlations, and demographic breakdowns across 5,184 households.',
    badge: '5,184 households',
    color: 'blue',
    icon: '🏠',
  },
  {
    href: '/regional',
    title: 'Regional Map',
    description:
      'Interactive choropleth of all 11 Armenian marzes. Visualize poverty, crime, health capacity, and the composite stress index over 2016–2022.',
    badge: '11 regions',
    color: 'emerald',
    icon: '🗺️',
  },
  {
    href: '/models',
    title: 'ML Models',
    description:
      'Compare 5 ML models (GBM, RF, ET, Ridge, Lasso). Explore feature importances, model metrics, and forecasting results.',
    badge: '5 models',
    color: 'amber',
    icon: '🤖',
  },
  {
    href: '/explorer',
    title: 'Data Explorer',
    description:
      'Browse and filter the full household dataset. Download filtered subsets as CSV.',
    badge: 'filterable table',
    color: 'slate',
    icon: '🔍',
  },
];

export default async function HomePage() {
  const [stats, metrics, years] = await Promise.all([
    getHouseholdStats(),
    getModelMetrics(),
    getRegionalYears(),
  ]);

  const bestModel = metrics[0];
  const yearRange = years.length > 0 ? `${years[0]}–${years[years.length - 1]}` : '2016–2022';

  return (
    <div>
      {/* Hero */}
      <div className="mb-8 rounded-2xl bg-gradient-to-br from-blue-900 to-blue-700 px-8 py-10 text-white">
        <div className="max-w-2xl">
          <div className="mb-3 flex items-center gap-2">
            <span className="rounded-full bg-white/20 px-3 py-0.5 text-xs font-medium">
              Armenia Capstone Project
            </span>
          </div>
          <h1 className="text-4xl font-bold leading-tight">
            Poverty Prediction &amp; Regional Analysis
          </h1>
          <p className="mt-3 text-blue-100 text-lg leading-relaxed">
            Machine learning analysis of household socioeconomic outcomes using the ILCS 2015
            survey and ArmStat regional panel data.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/regional"
              className="rounded-lg bg-white px-5 py-2.5 text-sm font-semibold text-blue-900 hover:bg-blue-50 transition-colors"
            >
              View Regional Map →
            </Link>
            <Link
              href="/household"
              className="rounded-lg border border-white/40 px-5 py-2.5 text-sm font-semibold text-white hover:bg-white/10 transition-colors"
            >
              Explore Households
            </Link>
          </div>
        </div>
      </div>

      {/* KPI cards */}
      <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
        <KpiCard
          title="Households surveyed"
          value={stats.count.toLocaleString()}
          subtitle="ILCS 2015"
          color="blue"
        />
        <KpiCard
          title="Median household income"
          value={formatAMD(Math.round(stats.median_income), true)}
          subtitle="AMD per year"
          color="emerald"
        />
        <KpiCard
          title="Best model R²"
          value={bestModel.r2.toFixed(3)}
          subtitle={`${bestModel.model.toUpperCase()} — Bayesian optimized`}
          color="amber"
        />
        <KpiCard
          title="Regional data years"
          value={yearRange}
          subtitle="11 marzes monthly"
          color="slate"
        />
      </div>

      {/* Section cards */}
      <div className="mb-8 grid gap-4 md:grid-cols-2">
        {SECTION_CARDS.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="group rounded-xl border border-slate-200 bg-white p-6 hover:border-blue-200 hover:shadow-md transition-all"
          >
            <div className="flex items-start gap-3">
              <span className="text-2xl">{card.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h2 className="text-base font-semibold text-slate-900 group-hover:text-blue-700 transition-colors">
                    {card.title}
                  </h2>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                    {card.badge}
                  </span>
                </div>
                <p className="text-sm text-slate-500 leading-relaxed">{card.description}</p>
              </div>
              <span className="text-slate-300 group-hover:text-blue-400 transition-colors text-lg">→</span>
            </div>
          </Link>
        ))}
      </div>

      {/* Model metrics preview */}
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-base font-semibold text-slate-900 mb-4">Model Performance Summary</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-left py-2 pr-4 font-medium text-slate-500">Model</th>
                <th className="text-right py-2 pr-4 font-medium text-slate-500">R²</th>
                <th className="text-right py-2 pr-4 font-medium text-slate-500">MAE (AMD)</th>
                <th className="text-right py-2 font-medium text-slate-500">RMSE (AMD)</th>
              </tr>
            </thead>
            <tbody>
              {metrics.map((m, i) => (
                <tr key={m.model} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="py-2 pr-4 font-medium text-slate-900">
                    {i === 0 && (
                      <span className="mr-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700">
                        BEST
                      </span>
                    )}
                    {m.model.toUpperCase()}
                    {m.is_bayesian_optimized ? (
                      <span className="ml-2 text-xs text-slate-400">Bayesian opt.</span>
                    ) : null}
                  </td>
                  <td className="py-2 pr-4 text-right tabular-nums text-slate-700">
                    {m.r2.toFixed(4)}
                  </td>
                  <td className="py-2 pr-4 text-right tabular-nums text-slate-700">
                    {formatAMD(Math.round(m.mae), true)}
                  </td>
                  <td className="py-2 text-right tabular-nums text-slate-700">
                    {formatAMD(Math.round(m.rmse), true)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Link href="/models" className="mt-4 inline-block text-sm text-blue-600 hover:underline">
          Full model analysis →
        </Link>
      </div>
    </div>
  );
}
