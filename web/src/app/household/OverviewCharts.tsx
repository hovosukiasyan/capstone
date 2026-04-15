'use client';

import { useState } from 'react';
import useSWR from 'swr';
import IncomeHistogram from '@/components/charts/IncomeHistogram';
import ErrorState from '@/components/layout/ErrorState';
import { apiFetcher, getErrorMessage } from '@/lib/fetcher';
import type { DistributionResponse } from '@/lib/types';

export default function HouseholdOverviewCharts() {
  const [logScale, setLogScale] = useState(true);

  const { data: dist, error } = useSWR<DistributionResponse>(
    `/api/households/distribution?column=household_income_total&bins=60`,
    apiFetcher
  );

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-slate-700">Income Distribution</h3>
        <label className="flex items-center gap-2 text-xs text-slate-500 cursor-pointer">
          <input
            type="checkbox"
            checked={logScale}
            onChange={(e) => setLogScale(e.target.checked)}
            className="rounded"
          />
          Log scale
        </label>
      </div>
      {error ? (
        <ErrorState compact message={getErrorMessage(error, 'Unable to load income distribution.')} />
      ) : dist ? (
        <IncomeHistogram bins={dist.bins} stats={dist.stats} logScale={logScale} />
      ) : (
        <div className="flex items-center justify-center h-64 text-slate-400 text-sm">
          Loading...
        </div>
      )}
      {dist && (
        <div className="mt-3 grid grid-cols-4 gap-3 text-xs text-center">
          <div className="rounded-lg bg-slate-50 p-2">
            <div className="font-semibold text-slate-700">P10</div>
            <div className="text-slate-500">{Math.round(dist.stats.p10).toLocaleString()} ֏</div>
          </div>
          <div className="rounded-lg bg-emerald-50 p-2">
            <div className="font-semibold text-emerald-700">Median</div>
            <div className="text-slate-500">{Math.round(dist.stats.median).toLocaleString()} ֏</div>
          </div>
          <div className="rounded-lg bg-amber-50 p-2">
            <div className="font-semibold text-amber-700">Mean</div>
            <div className="text-slate-500">{Math.round(dist.stats.mean).toLocaleString()} ֏</div>
          </div>
          <div className="rounded-lg bg-slate-50 p-2">
            <div className="font-semibold text-slate-700">P90</div>
            <div className="text-slate-500">{Math.round(dist.stats.p90).toLocaleString()} ֏</div>
          </div>
        </div>
      )}
    </div>
  );
}
