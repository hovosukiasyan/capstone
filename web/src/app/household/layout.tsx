import SectionSidebar from '@/components/layout/SectionSidebar';

const ITEMS = [
  { href: '/household', label: 'Overview', description: 'Income & seasonality' },
  { href: '/household/distribution', label: 'Distributions', description: 'Column explorer' },
  { href: '/household/features', label: 'Feature Explorer', description: 'X vs Y scatter' },
  { href: '/household/correlations', label: 'Correlations', description: '28×28 heatmap' },
  { href: '/household/tsne', label: 't-SNE Clusters', description: '5k point scatter' },
];

export default function HouseholdLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-8">
      <SectionSidebar items={ITEMS} title="Households" />
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
