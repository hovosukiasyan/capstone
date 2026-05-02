import PageHeader from '@/components/layout/PageHeader';
import ValidationClient from './ValidationClient';

export default function ValidationPage() {
  return (
    <div>
      <PageHeader
        title="2022 Forecast Validation"
        subtitle="GRU trained on the 2016–2021 panel, validated on 2021, and tested against fully held-out 2022 observations across all 11 Armenian marzes — R²&nbsp;=&nbsp;0.9999."
      />
      <ValidationClient />
    </div>
  );
}
