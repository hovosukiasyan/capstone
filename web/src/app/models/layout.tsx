import SectionSidebar from '@/components/layout/SectionSidebar';

const ITEMS = [
  { href: '/models', label: 'Model Comparison', description: 'R², MAE, RMSE' },
  { href: '/models/importance', label: 'Feature Importance', description: 'Per-model rankings' },
  { href: '/models/forecasting', label: 'Forecasting Results', description: 'Poverty & stress' },
  { href: '/models/forecast', label: 'Forecast 2023–2026', description: 'Timeline & choropleth' },
];

export default function ModelsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-8">
      <SectionSidebar items={ITEMS} title="Models" />
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
