import SectionSidebar from '@/components/layout/SectionSidebar';

const ITEMS = [
  { href: '/models/validation', label: '2022 Validation', description: 'Actual vs forecast' },
  { href: '/models', label: 'Household Model', description: 'ILCS income benchmark' },
  { href: '/models/importance', label: 'Feature Importance', description: 'Per-model rankings' },
  { href: '/models/forecasting', label: 'Forecasting Diagnostics', description: 'Model tests & caveats' },
  { href: '/models/forecast', label: 'Future Projection', description: '2023–2026 scenario' },
];

export default function ModelsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-8">
      <SectionSidebar items={ITEMS} title="Models" />
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
