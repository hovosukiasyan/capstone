import Link from 'next/link';
import PageHeader from '@/components/layout/PageHeader';
import KpiCard from '@/components/cards/KpiCard';
import HouseholdOverviewCharts from './OverviewCharts';
import { getHouseholdStats } from '@/lib/csv-data';
import { formatAMD } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function HouseholdPage() {
  const stats = await getHouseholdStats();

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
      <HouseholdOverviewCharts />

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
            style={{
              display: 'block',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)',
              padding: '1rem',
              textDecoration: 'none',
              transition: 'border-color 0.15s, box-shadow 0.15s',
            }}
            className="group hover:border-[var(--warm-400)] hover:shadow-[var(--shadow-sm)]"
          >
            <p
              style={{
                fontFamily: 'var(--font-sans)',
                fontWeight: 500,
                fontSize: '0.875rem',
                color: 'var(--text-primary)',
                margin: 0,
              }}
              className="group-hover:text-[var(--warm-700)]"
            >
              {label}
            </p>
            <p
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: '0.75rem',
                color: 'var(--text-muted)',
                marginTop: '0.25rem',
              }}
            >
              {desc}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
