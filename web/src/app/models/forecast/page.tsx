import PageHeader from '@/components/layout/PageHeader';
import ForecastTimeline from './ForecastTimeline';

export default function ForecastPage() {
  return (
    <div>
      <PageHeader
        title="Future Projection 2023–2026"
        subtitle="Projection starts after the final observed year (2022). Historical observations 2016–2022 are shown at left; forecast 2023–2026 continues with 90% confidence intervals."
      />
      <div className="mb-6 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
        <strong>Projection begins in 2023.</strong> The observed 2016–2022 data anchors the chart.
        To evaluate how well these models actually performed, see the{' '}
        <a href="/models/validation" className="font-medium text-blue-700 underline">
          2022 Validation
        </a>{' '}
        page before drawing conclusions from these projections.
      </div>
      <ForecastTimeline />
    </div>
  );
}
