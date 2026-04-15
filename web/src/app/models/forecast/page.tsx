import PageHeader from '@/components/layout/PageHeader';
import ForecastTimeline from './ForecastTimeline';

export default function ForecastPage() {
  return (
    <div>
      <PageHeader
        title="Forecast 2023–2026"
        subtitle="Ensemble model projections for regional poverty rate and stress index. Historical ILCS observations (2016–2022) connected to four-year forecasts with 95% confidence intervals."
      />
      <ForecastTimeline />
    </div>
  );
}
