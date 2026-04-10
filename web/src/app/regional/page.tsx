'use client';

import { useState } from 'react';
import useSWR from 'swr';
import ChoroplethMap from '@/components/charts/ChoroplethMap';
import ErrorState from '@/components/layout/ErrorState';
import RegionalTimeSeries, { type RegionalTimeSeriesPoint } from '@/components/charts/RegionalTimeSeries';
import PageHeader from '@/components/layout/PageHeader';
import { REGIONAL_INDICATORS } from '@/lib/constants';
import { apiFetcher, getErrorMessage } from '@/lib/fetcher';
import { formatPct } from '@/lib/utils';
import type { ChoroplethRow } from '@/lib/types';

export default function RegionalMapPage() {
  const [indicator, setIndicator] = useState('poverty_rate');
  const [year, setYear] = useState<number | 'avg'>(2022);
  const [selectedMarz, setSelectedMarz] = useState<string | null>(null);

  const yearParam = year === 'avg' ? 'avg' : year.toString();
  const { data: choroplethData, error: choroplethError } = useSWR<ChoroplethRow[]>(
    `/api/regional/choropleth?indicator=${indicator}&year=${yearParam}`,
    apiFetcher
  );

  const { data: timeSeriesData, error: timeSeriesError } = useSWR<RegionalTimeSeriesPoint[]>(
    selectedMarz
      ? `/api/regional/panel?marz=${encodeURIComponent(selectedMarz)}&indicator=${indicator}`
      : null,
    apiFetcher
  );

  const indicatorMeta = REGIONAL_INDICATORS.find((i) => i.key === indicator);
  const colorScheme = indicatorMeta?.colorScheme === 'cool' ? 'cool' : 'warm';

  return (
    <div>
      <PageHeader
        title="Regional Map"
        subtitle="Click a region to see its trend. All 11 Armenian marzes."
      />

      {/* Controls */}
      <div className="mb-6 flex flex-wrap items-center gap-4">
        {/* Indicator selector */}
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Indicator</label>
          <select
            value={indicator}
            onChange={(e) => setIndicator(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {REGIONAL_INDICATORS.map((i) => (
              <option key={i.key} value={i.key}>
                {i.label}
              </option>
            ))}
          </select>
        </div>

        {/* Year selector */}
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Year</label>
          <select
            value={year}
            onChange={(e) => setYear(e.target.value === 'avg' ? 'avg' : parseInt(e.target.value, 10))}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="avg">Average 2016–2022</option>
            {[2016, 2017, 2018, 2019, 2020, 2021, 2022].map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>

        {selectedMarz && (
          <button
            onClick={() => setSelectedMarz(null)}
            className="ml-auto text-xs text-slate-500 hover:text-slate-700 border border-slate-200 rounded-lg px-3 py-1.5"
          >
            ✕ Clear selection
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Map */}
        <div className="lg:col-span-2 rounded-xl border border-slate-200 bg-white p-4">
          {choroplethError && (
            <ErrorState compact message={getErrorMessage(choroplethError, 'Unable to load choropleth data.')} />
          )}
          <ChoroplethMap
            data={choroplethData ?? []}
            indicator={indicator}
            colorScheme={colorScheme}
            onRegionClick={setSelectedMarz}
            selectedMarz={selectedMarz}
          />
        </div>

        {/* Side panel */}
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          {selectedMarz ? (
            <>
              <h3 className="font-semibold text-slate-900 mb-1">{selectedMarz}</h3>
              <p className="text-xs text-slate-500 mb-4">
                {indicatorMeta?.label} — 2016–2022 monthly
              </p>
              {timeSeriesData && (
                <RegionalTimeSeries
                  data={timeSeriesData}
                  marzes={[selectedMarz]}
                  indicatorLabel={indicatorMeta?.label ?? indicator}
                />
              )}
              {!timeSeriesData && !timeSeriesError && (
                <div className="text-slate-400 text-sm">Loading trend...</div>
              )}
              {timeSeriesError && (
                <ErrorState compact message={getErrorMessage(timeSeriesError, 'Unable to load regional trend data.')} />
              )}
            </>
          ) : (
            <>
              <h3 className="font-semibold text-slate-900 mb-3">All Regions</h3>
              <div className="space-y-2">
                {(choroplethData ?? [])
                  .filter((d) => d.value !== null)
                  .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
                  .map((d, i) => (
                    <button
                      key={d.marz}
                      onClick={() => setSelectedMarz(d.marz)}
                      className="w-full flex items-center justify-between rounded-lg px-3 py-2 text-sm hover:bg-slate-50 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-400 w-5 text-right">{i + 1}</span>
                        <span className="text-slate-700">{d.marz}</span>
                      </div>
                      <span className="tabular-nums text-slate-600">
                        {['poverty_rate', 'extreme_poverty_rate'].includes(indicator)
                          ? formatPct(d.value ?? 0)
                          : (d.value ?? 0).toFixed(2)}
                      </span>
                    </button>
                  ))}
              </div>
              <p className="mt-3 text-xs text-slate-400">Click a region to see its trend</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
