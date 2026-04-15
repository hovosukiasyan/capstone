'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import PageHeader from '@/components/layout/PageHeader';
import ErrorState from '@/components/layout/ErrorState';
import { HOUSEHOLD_COLUMNS, MONTH_LABELS, ORDINAL_LABELS } from '@/lib/constants';
import { apiFetcher, getErrorMessage } from '@/lib/fetcher';
import { decodeLabel, formatAMD } from '@/lib/utils';
import type { Household, PaginatedResponse } from '@/lib/types';

const VISIBLE_COLS: (keyof Household)[] = [
  'id',
  'interview_month',
  'household_size',
  'household_income_total',
  'household_income_source_count',
  'food_purchases_total',
  'has_computer',
  'household_has_car',
  'dwelling_condition_estimate',
  'registered_poverty_benefit',
];

type ExplorerFilters = {
  incomeMin: string;
  incomeMax: string;
  sizeMin: string;
  sizeMax: string;
  hasComputer: string;
  hasCar: string;
  benefitLevel: string;
  interviewMonth: string;
};

const DEFAULT_FILTERS: ExplorerFilters = {
  incomeMin: '',
  incomeMax: '',
  sizeMin: '',
  sizeMax: '',
  hasComputer: '',
  hasCar: '',
  benefitLevel: '',
  interviewMonth: '',
};

function sanitizeDigits(value: string) {
  return value.replace(/[^\d]/g, '');
}

function textInputClassName() {
  return 'w-full rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text-primary)] shadow-sm transition focus:border-[var(--cool-400)] focus:outline-none focus:ring-2 focus:ring-[color:rgb(106_174_212_/_0.25)]';
}

function selectInputClassName() {
  return 'w-full rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text-primary)] shadow-sm transition focus:border-[var(--cool-400)] focus:outline-none focus:ring-2 focus:ring-[color:rgb(106_174_212_/_0.25)]';
}

export default function ExplorerPage() {
  const [page, setPage] = useState(1);
  const [sortCol, setSortCol] = useState('id');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [draftFilters, setDraftFilters] = useState<ExplorerFilters>(DEFAULT_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<ExplorerFilters>(DEFAULT_FILTERS);

  const activeFilterCount = useMemo(
    () => Object.values(appliedFilters).filter(Boolean).length,
    [appliedFilters]
  );

  const buildUrl = useMemo(() => {
    const params = new URLSearchParams({
      page: String(page),
      per_page: '50',
      sort_col: sortCol,
      sort_dir: sortDir,
    });

    const filterParamMap: Record<keyof ExplorerFilters, string> = {
      incomeMin: 'income_min',
      incomeMax: 'income_max',
      sizeMin: 'size_min',
      sizeMax: 'size_max',
      hasComputer: 'has_computer',
      hasCar: 'has_car',
      benefitLevel: 'benefit_level',
      interviewMonth: 'interview_month',
    };

    (Object.entries(appliedFilters) as Array<[keyof ExplorerFilters, string]>).forEach(([key, value]) => {
      if (value) params.set(filterParamMap[key], value);
    });

    return `/api/households/list?${params.toString()}`;
  }, [page, sortCol, sortDir, appliedFilters]);

  const { data, error, isLoading } = useSWR<PaginatedResponse<Household>>(buildUrl, apiFetcher);

  const totalPages = data ? Math.ceil(data.total / 50) : 1;

  const handleSort = (col: string) => {
    if (sortCol === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortCol(col);
      setSortDir('asc');
    }
    setPage(1);
  };

  const applyFilters = () => {
    setAppliedFilters(draftFilters);
    setPage(1);
  };

  const clearFilters = () => {
    setDraftFilters(DEFAULT_FILTERS);
    setAppliedFilters(DEFAULT_FILTERS);
    setPage(1);
  };

  const updateDraft = (key: keyof ExplorerFilters, value: string) => {
    setDraftFilters((prev) => ({ ...prev, [key]: value }));
  };

  const formatCell = (col: keyof Household, value: unknown) => {
    if (value === null || value === undefined) return '—';
    if (col === 'interview_month') return MONTH_LABELS[Number(value) - 1] ?? String(value);
    const meta = HOUSEHOLD_COLUMNS.find((c) => c.key === col);
    if (meta?.type === 'monetary') return formatAMD(Number(value), true);
    if (meta?.type === 'binary' || meta?.type === 'ordinal') return decodeLabel(col, Number(value));
    return String(value);
  };

  const handleDownload = async () => {
    const params = new URLSearchParams({
      page: '1',
      per_page: '200',
      sort_col: sortCol,
      sort_dir: sortDir,
    });

    const filterParamMap: Record<keyof ExplorerFilters, string> = {
      incomeMin: 'income_min',
      incomeMax: 'income_max',
      sizeMin: 'size_min',
      sizeMax: 'size_max',
      hasComputer: 'has_computer',
      hasCar: 'has_car',
      benefitLevel: 'benefit_level',
      interviewMonth: 'interview_month',
    };

    (Object.entries(appliedFilters) as Array<[keyof ExplorerFilters, string]>).forEach(([key, value]) => {
      if (value) params.set(filterParamMap[key], value);
    });

    const res = await fetch(`/api/households/list?${params}`);
    const json: PaginatedResponse<Household> = await res.json();
    const csvRows = [
      VISIBLE_COLS.join(','),
      ...json.rows.map((row) => VISIBLE_COLS.map((c) => JSON.stringify(row[c] ?? '')).join(',')),
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
    <div className="space-y-6">
      <PageHeader
        title="Data Explorer"
        subtitle="Browse the ILCS 2015 household dataset with analytical filters, cleaner sorting, and exportable views."
      >
        <button
          onClick={handleDownload}
          className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm font-medium text-[var(--text-primary)] shadow-sm transition hover:-translate-y-px hover:border-[var(--cool-300)] hover:shadow-[var(--shadow-md)]"
        >
          Download Filtered CSV
        </button>
      </PageHeader>

      <section
        className="rounded-[var(--radius-xl)] border p-5 shadow-[var(--shadow-sm)]"
        style={{
          background:
            'linear-gradient(180deg, rgba(255,255,255,0.92) 0%, rgba(253,252,250,0.96) 100%)',
          borderColor: 'var(--border)',
        }}
      >
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-faint)]">
              Household Filters
            </p>
            <h2 className="mt-1 text-lg font-medium text-[var(--text-primary)]">
              Narrow the sample before reading the table
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-[var(--text-muted)]">
              Filter by income range, household structure, asset ownership, benefit status, and survey month.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="rounded-full border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-3 py-1 text-xs text-[var(--text-secondary)]">
              {activeFilterCount} active filter{activeFilterCount === 1 ? '' : 's'}
            </div>
            <button
              onClick={clearFilters}
              className="rounded-full border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition hover:bg-[var(--surface-subtle)]"
            >
              Reset
            </button>
            <button
              onClick={applyFilters}
              className="rounded-full bg-[var(--cool-700)] px-3 py-1.5 text-xs font-medium text-white transition hover:bg-[var(--cool-800)]"
            >
              Apply Filters
            </button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="space-y-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface)] p-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--text-faint)]">Income Range</p>
              <p className="mt-1 text-sm text-[var(--text-muted)]">Exact AMD values without input stepping or mouse-wheel drift.</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-xs text-[var(--text-muted)]">Min income</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={draftFilters.incomeMin}
                  onChange={(e) => updateDraft('incomeMin', sanitizeDigits(e.target.value))}
                  placeholder="50000"
                  className={textInputClassName()}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-[var(--text-muted)]">Max income</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={draftFilters.incomeMax}
                  onChange={(e) => updateDraft('incomeMax', sanitizeDigits(e.target.value))}
                  placeholder="1000000"
                  className={textInputClassName()}
                />
              </div>
            </div>
          </div>

          <div className="space-y-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface)] p-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--text-faint)]">Household Structure</p>
              <p className="mt-1 text-sm text-[var(--text-muted)]">Focus on smaller or larger households and seasonal interview patterns.</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-xs text-[var(--text-muted)]">Min size</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={draftFilters.sizeMin}
                  onChange={(e) => updateDraft('sizeMin', sanitizeDigits(e.target.value))}
                  placeholder="1"
                  className={textInputClassName()}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-[var(--text-muted)]">Max size</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={draftFilters.sizeMax}
                  onChange={(e) => updateDraft('sizeMax', sanitizeDigits(e.target.value))}
                  placeholder="10"
                  className={textInputClassName()}
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs text-[var(--text-muted)]">Interview month</label>
              <select
                value={draftFilters.interviewMonth}
                onChange={(e) => updateDraft('interviewMonth', e.target.value)}
                className={selectInputClassName()}
              >
                <option value="">All months</option>
                {MONTH_LABELS.map((month, index) => (
                  <option key={month} value={index + 1}>
                    {month}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface)] p-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--text-faint)]">Asset Access</p>
              <p className="mt-1 text-sm text-[var(--text-muted)]">Slice the table by core household assets often used in vulnerability analysis.</p>
            </div>
            <div>
              <label className="mb-1 block text-xs text-[var(--text-muted)]">Computer ownership</label>
              <select
                value={draftFilters.hasComputer}
                onChange={(e) => updateDraft('hasComputer', e.target.value)}
                className={selectInputClassName()}
              >
                <option value="">All households</option>
                <option value="1">Has computer</option>
                <option value="2">No computer</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-[var(--text-muted)]">Car ownership</label>
              <select
                value={draftFilters.hasCar}
                onChange={(e) => updateDraft('hasCar', e.target.value)}
                className={selectInputClassName()}
              >
                <option value="">All households</option>
                <option value="1">Has car</option>
                <option value="2">No car</option>
              </select>
            </div>
          </div>

          <div className="space-y-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface)] p-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--text-faint)]">Benefit Status</p>
              <p className="mt-1 text-sm text-[var(--text-muted)]">Filter by formal poverty-benefit categories in the survey.</p>
            </div>
            <div>
              <label className="mb-1 block text-xs text-[var(--text-muted)]">Benefit level</label>
              <select
                value={draftFilters.benefitLevel}
                onChange={(e) => updateDraft('benefitLevel', e.target.value)}
                className={selectInputClassName()}
              >
                <option value="">All levels</option>
                {Object.entries(ORDINAL_LABELS.registered_poverty_benefit).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {data && (
          <div className="mt-5 flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)]">
            <span className="rounded-full bg-[var(--surface-subtle)] px-3 py-1">
              Showing {data.rows.length} rows on this page
            </span>
            <span className="rounded-full bg-[var(--surface-subtle)] px-3 py-1">
              {data.total.toLocaleString()} households match current filters
            </span>
            <span className="rounded-full bg-[var(--surface-subtle)] px-3 py-1">
              Sorted by {HOUSEHOLD_COLUMNS.find((c) => c.key === sortCol)?.label ?? sortCol} ({sortDir})
            </span>
          </div>
        )}
      </section>

      <section className="overflow-hidden rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-sm)]">
        {error && (
          <div className="border-b border-[var(--border-subtle)] p-4">
            <ErrorState compact message={getErrorMessage(error, 'Unable to load households.')} />
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 z-10 bg-[var(--surface-raised)]">
              <tr className="border-b border-[var(--border-subtle)]">
                {VISIBLE_COLS.map((col) => {
                  const meta = HOUSEHOLD_COLUMNS.find((c) => c.key === col);
                  const isSorted = sortCol === col;
                  return (
                    <th
                      key={col}
                      className="cursor-pointer whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-faint)] transition hover:text-[var(--text-secondary)]"
                      onClick={() => handleSort(col)}
                    >
                      <span className="inline-flex items-center gap-1.5">
                        <span>{meta?.label ?? col}</span>
                        <span className={isSorted ? 'text-[var(--cool-700)]' : 'text-[var(--text-faint)]'}>
                          {isSorted ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
                        </span>
                      </span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {!data && !error && (
                <tr>
                  <td colSpan={VISIBLE_COLS.length} className="px-4 py-10 text-center text-sm text-[var(--text-muted)]">
                    {isLoading ? 'Loading households…' : 'Preparing table…'}
                  </td>
                </tr>
              )}
              {data?.rows.map((row, rowIndex) => (
                <tr
                  key={row.id}
                  className="border-b border-[var(--border-subtle)] transition hover:bg-[var(--surface-subtle)]"
                  style={{ background: rowIndex % 2 === 0 ? 'transparent' : 'rgba(242, 239, 233, 0.35)' }}
                >
                  {VISIBLE_COLS.map((col) => (
                    <td key={col} className="whitespace-nowrap px-4 py-3 text-xs text-[var(--text-secondary)]">
                      <span className="font-data">{formatCell(col, row[col])}</span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {data && totalPages > 1 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border-subtle)] bg-[var(--surface-raised)] px-4 py-3">
            <div className="flex items-center gap-2">
              <button
                disabled={page === 1}
                onClick={() => setPage(1)}
                className="rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs text-[var(--text-secondary)] transition hover:bg-[var(--surface-subtle)] disabled:opacity-30"
              >
                First
              </button>
              <button
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
                className="rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs text-[var(--text-secondary)] transition hover:bg-[var(--surface-subtle)] disabled:opacity-30"
              >
                Previous
              </button>
            </div>

            <div className="text-xs text-[var(--text-muted)]">
              Page <span className="font-data text-[var(--text-primary)]">{page}</span> of{' '}
              <span className="font-data text-[var(--text-primary)]">{totalPages}</span>
            </div>

            <div className="flex items-center gap-2">
              <button
                disabled={page === totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs text-[var(--text-secondary)] transition hover:bg-[var(--surface-subtle)] disabled:opacity-30"
              >
                Next
              </button>
              <button
                disabled={page === totalPages}
                onClick={() => setPage(totalPages)}
                className="rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs text-[var(--text-secondary)] transition hover:bg-[var(--surface-subtle)] disabled:opacity-30"
              >
                Last
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
