'use client';

import { useState } from 'react';
import useSWR from 'swr';
import RegionalTimeSeries, { type RegionalTimeSeriesPoint } from '@/components/charts/RegionalTimeSeries';
import ErrorState from '@/components/layout/ErrorState';
import PageHeader from '@/components/layout/PageHeader';
import { MARZ_NAMES, REGIONAL_INDICATORS } from '@/lib/constants';
import { apiFetcher, getErrorMessage } from '@/lib/fetcher';

export default function RegionalTrendsPage() {
  const [selectedMarzes, setSelectedMarzes] = useState<string[]>(['Yerevan', 'Shirak', 'Gegharkunik']);
  const [indicator, setIndicator] = useState('poverty_rate');

  const marzParam = selectedMarzes.join(',');
  const { data, error } = useSWR<RegionalTimeSeriesPoint[]>(
    marzParam
      ? `/api/regional/panel?marz=${encodeURIComponent(marzParam)}&indicator=${indicator}`
      : null,
    apiFetcher
  );

  const indicatorMeta = REGIONAL_INDICATORS.find((i) => i.key === indicator);

  const toggleMarz = (m: string) => {
    setSelectedMarzes((prev) =>
      prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m].slice(-6)
    );
  };

  return (
    <div>
      <PageHeader
        title="Regional Time Series"
        subtitle="Compare poverty, crime, and health indicators across marzes over 2016–2022."
      />

      <div className="mb-6 flex flex-wrap gap-4">
        {/* Indicator */}
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Indicator</label>
          <select
            value={indicator}
            onChange={(e) => setIndicator(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {REGIONAL_INDICATORS.map((i) => (
              <option key={i.key} value={i.key}>{i.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Region selector */}
      <div className="mb-6 rounded-xl border border-slate-200 bg-white p-4">
        <p className="text-xs font-medium text-slate-500 mb-3">Select regions (up to 6):</p>
        <div className="flex flex-wrap gap-2">
          {MARZ_NAMES.map((marz) => {
            const selected = selectedMarzes.includes(marz);
            return (
              <button
                key={marz}
                onClick={() => toggleMarz(marz)}
                className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
                  selected
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {marz}
              </button>
            );
          })}
        </div>
      </div>

      {/* Chart */}
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <h3 className="text-sm font-semibold text-slate-700 mb-4">
          {indicatorMeta?.label} — Monthly 2016–2022
        </h3>
        {selectedMarzes.length === 0 ? (
          <p className="text-slate-400 text-sm">Select at least one region above.</p>
        ) : error ? (
          <ErrorState message={getErrorMessage(error, 'Unable to load regional trend data.')} />
        ) : (
          <RegionalTimeSeries
            data={data ?? []}
            marzes={selectedMarzes}
            indicatorLabel={indicatorMeta?.label ?? indicator}
          />
        )}
      </div>
    </div>
  );
}
