'use client';

import { useState, useCallback } from 'react';
import useSWR from 'swr';
import PageHeader from '@/components/layout/PageHeader';
import ErrorState from '@/components/layout/ErrorState';
import { HOUSEHOLD_COLUMNS } from '@/lib/constants';
import { apiFetcher, getErrorMessage } from '@/lib/fetcher';
import { formatAMD, decodeLabel } from '@/lib/utils';
import type { Household, PaginatedResponse } from '@/lib/types';

const VISIBLE_COLS: (keyof Household)[] = [
  'id', 'interview_month', 'household_size', 'household_income_total',
  'household_income_source_count', 'food_purchases_total', 'has_computer',
  'household_has_car', 'dwelling_condition_estimate', 'registered_poverty_benefit',
];

export default function ExplorerPage() {
  const [page, setPage] = useState(1);
  const [sortCol, setSortCol] = useState('id');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [incomeMin, setIncomeMin] = useState('');
  const [incomeMax, setIncomeMax] = useState('');
  const [sizeMin, setSizeMin] = useState('');
  const [sizeMax, setSizeMax] = useState('');

  const buildUrl = useCallback(() => {
    const params = new URLSearchParams({
      page: String(page),
      per_page: '50',
      sort_col: sortCol,
      sort_dir: sortDir,
    });
    if (incomeMin) params.set('income_min', incomeMin);
    if (incomeMax) params.set('income_max', incomeMax);
    if (sizeMin) params.set('size_min', sizeMin);
    if (sizeMax) params.set('size_max', sizeMax);
    return `/api/households/list?${params}`;
  }, [page, sortCol, sortDir, incomeMin, incomeMax, sizeMin, sizeMax]);

  const { data, error } = useSWR<PaginatedResponse<Household>>(buildUrl(), apiFetcher);

  const handleSort = (col: string) => {
    if (sortCol === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortCol(col);
      setSortDir('asc');
    }
    setPage(1);
  };

  const totalPages = data ? Math.ceil(data.total / 50) : 1;

  const formatCell = (col: keyof Household, value: unknown) => {
    if (value === null || value === undefined) return '—';
    const meta = HOUSEHOLD_COLUMNS.find((c) => c.key === col);
    if (meta?.type === 'monetary') return formatAMD(Number(value), true);
    if (meta?.type === 'binary') return decodeLabel(col, Number(value));
    if (meta?.type === 'ordinal') return decodeLabel(col, Number(value));
    return String(value);
  };

  const handleDownload = async () => {
    const params = new URLSearchParams({
      page: '1',
      per_page: '200',
      sort_col: sortCol,
      sort_dir: sortDir,
    });
    if (incomeMin) params.set('income_min', incomeMin);
    if (incomeMax) params.set('income_max', incomeMax);
    if (sizeMin) params.set('size_min', sizeMin);
    if (sizeMax) params.set('size_max', sizeMax);
    const res = await fetch(`/api/households/list?${params}`);
    const json: PaginatedResponse<Household> = await res.json();
    const cols = VISIBLE_COLS;
    const csvRows = [
      cols.join(','),
      ...json.rows.map((row) =>
        cols.map((c) => JSON.stringify(row[c] ?? '')).join(',')
      ),
    ];
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'households_filtered.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <PageHeader
        title="Data Explorer"
        subtitle="Browse and filter the full ILCS 2015 household dataset."
      >
        <button
          onClick={handleDownload}
          className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
        >
          ↓ Download CSV
        </button>
      </PageHeader>

      {/* Filters */}
      <div className="mb-6 rounded-xl border border-slate-200 bg-white p-5">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-4">Filters</p>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <div>
            <label className="block text-xs text-slate-500 mb-1">Min income (AMD)</label>
            <input
              type="number"
              value={incomeMin}
              onChange={(e) => { setIncomeMin(e.target.value); setPage(1); }}
              placeholder="e.g. 50000"
              className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Max income (AMD)</label>
            <input
              type="number"
              value={incomeMax}
              onChange={(e) => { setIncomeMax(e.target.value); setPage(1); }}
              placeholder="e.g. 1000000"
              className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Min household size</label>
            <input
              type="number"
              value={sizeMin}
              onChange={(e) => { setSizeMin(e.target.value); setPage(1); }}
              placeholder="1"
              min={1}
              max={20}
              className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Max household size</label>
            <input
              type="number"
              value={sizeMax}
              onChange={(e) => { setSizeMax(e.target.value); setPage(1); }}
              placeholder="19"
              min={1}
              max={20}
              className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
        {data && (
          <p className="mt-3 text-xs text-slate-400">
            Showing {data.rows.length} of {data.total.toLocaleString()} households
          </p>
        )}
      </div>

      {/* Table */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        {error && (
          <div className="p-4">
            <ErrorState compact message={getErrorMessage(error, 'Unable to load households.')} />
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                {VISIBLE_COLS.map((col) => {
                  const meta = HOUSEHOLD_COLUMNS.find((c) => c.key === col);
                  const isSorted = sortCol === col;
                  return (
                    <th
                      key={col}
                      className="px-4 py-3 text-left font-medium text-slate-500 cursor-pointer hover:text-slate-700 select-none whitespace-nowrap"
                      onClick={() => handleSort(col)}
                    >
                      {meta?.label ?? col}
                      {isSorted && <span className="ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {!data && !error && (
                <tr>
                  <td colSpan={VISIBLE_COLS.length} className="px-4 py-8 text-center text-slate-400">
                    Loading...
                  </td>
                </tr>
              )}
              {data?.rows.map((row) => (
                <tr key={row.id} className="border-b border-slate-50 hover:bg-slate-50">
                  {VISIBLE_COLS.map((col) => (
                    <td key={col} className="px-4 py-2.5 tabular-nums text-slate-700 whitespace-nowrap text-xs">
                      {formatCell(col, row[col])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {data && totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3">
            <button
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 disabled:opacity-40 hover:bg-slate-50 transition-colors"
            >
              ← Previous
            </button>
            <span className="text-sm text-slate-500">
              Page {page} of {totalPages}
            </span>
            <button
              disabled={page === totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 disabled:opacity-40 hover:bg-slate-50 transition-colors"
            >
              Next →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
