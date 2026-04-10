import SectionSidebar from '@/components/layout/SectionSidebar';

const ITEMS = [
  { href: '/regional', label: 'Choropleth Map', description: 'All 11 marzes' },
  { href: '/regional/trends', label: 'Time Series', description: 'Per-region trends' },
  { href: '/regional/ranking', label: 'Rankings', description: 'Compare marzes' },
];

export default function RegionalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-8">
      <SectionSidebar items={ITEMS} title="Regional" />
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
