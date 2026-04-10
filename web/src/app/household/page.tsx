import Link from 'next/link';
import PageHeader from '@/components/layout/PageHeader';
import KpiCard from '@/components/cards/KpiCard';
import HouseholdOverviewCharts from './OverviewCharts';
import { getHouseholdStats, getIncomeByMonth } from '@/lib/db';
import { formatAMD } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function HouseholdPage() {
  const [stats, byMonth] = await Promise.all([
    getHouseholdStats(),
    getIncomeByMonth(),
  ]);

  return (
    <div>
      <PageHeader
        title="Household Analysis"
        subtitle="ILCS 2015 — 5,184 households surveyed across all 12 months"
      />

      {/* KPI row */}
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <KpiCard
          title="Total households"
          value={stats.count.toLocaleString()}
          color="blue"
        />
        <KpiCard
          title="Median income"
          value={formatAMD(Math.round(stats.median_income), true)}
          subtitle="AMD/year"
          color="emerald"
        />
        <KpiCard
          title="Mean income"
          value={formatAMD(Math.round(stats.mean_income), true)}
          subtitle="higher due to skew"
          color="amber"
        />
        <KpiCard
          title="Income range"
          value={`${formatAMD(stats.min_income, true)} – ${formatAMD(stats.max_income, true)}`}
          subtitle="68,000× spread"
          color="slate"
        />
      </div>

      {/* Charts */}
      <HouseholdOverviewCharts initialByMonth={byMonth} />

      {/* Navigation to sub-pages */}
      <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        {[
          { href: '/household/distribution', label: 'Column Distributions', desc: 'Any variable histogram' },
          { href: '/household/features', label: 'Feature Explorer', desc: 'X vs Y scatter plot' },
          { href: '/household/correlations', label: 'Correlations', desc: '28×28 Pearson heatmap' },
          { href: '/household/tsne', label: 't-SNE Clusters', desc: 'Cluster visualization' },
        ].map(({ href, label, desc }) => (
          <Link
            key={href}
            href={href}
            className="group rounded-xl border border-slate-200 bg-white p-4 hover:border-blue-200 hover:shadow-sm transition-all"
          >
            <p className="font-medium text-slate-900 group-hover:text-blue-700 text-sm">{label}</p>
            <p className="text-xs text-slate-500 mt-1">{desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
