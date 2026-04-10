'use client';

import { useState, useEffect } from 'react';
import useSWR from 'swr';
import ErrorState from '@/components/layout/ErrorState';
import PageHeader from '@/components/layout/PageHeader';
import { HOUSEHOLD_COLUMNS } from '@/lib/constants';
import { apiFetcher, getErrorMessage } from '@/lib/fetcher';
import type { ScatterPoint } from '@/lib/types';

interface CorrelationData {
  columns: string[];
  matrix: number[][];
}

function getColor(r: number): string {
  // Diverging: blue (negative) → white → red (positive)
  if (r > 0) {
    const t = r;
    return `rgb(${Math.round(255)}, ${Math.round(255 - t * 200)}, ${Math.round(255 - t * 200)})`;
  } else {
    const t = -r;
    return `rgb(${Math.round(255 - t * 200)}, ${Math.round(255 - t * 200)}, ${Math.round(255)})`;
  }
}

export default function CorrelationsPage() {
  const [corrData, setCorrData] = useState<CorrelationData | null>(null);
  const [corrError, setCorrError] = useState<string | null>(null);
  const [sortByIncome, setSortByIncome] = useState(true);
  const [hovered, setHovered] = useState<{ i: number; j: number } | null>(null);
  const [modal, setModal] = useState<{ xCol: string; yCol: string } | null>(null);

  const { data: scatterData, error: scatterError } = useSWR<ScatterPoint[]>(
    modal
      ? `/api/households/scatter?x=${modal.xCol}&y=${modal.yCol}&p_min=1&p_max=99&color_by=household_income_source_count`
      : null,
    apiFetcher
  );

  useEffect(() => {
    let cancelled = false;

    apiFetcher<CorrelationData>('/correlations.json')
      .then((data) => {
        if (!cancelled) {
          setCorrData(data);
          setCorrError(null);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setCorrError(getErrorMessage(error, 'Unable to load the correlation matrix.'));
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (!corrData) {
    return (
      corrError ? (
        <ErrorState message={corrError} />
      ) : (
        <div className="flex items-center justify-center h-64 text-slate-400">
          Loading correlation matrix...
        </div>
      )
    );
  }

  let displayCols = corrData.columns;
  let displayMatrix = corrData.matrix;

  if (sortByIncome) {
    const incomeIdx = corrData.columns.indexOf('household_income_total');
    if (incomeIdx !== -1) {
      const incomeCorrs = corrData.matrix[incomeIdx];
      const order = incomeCorrs
        .map((v, i) => ({ v: Math.abs(v), i }))
        .sort((a, b) => b.v - a.v)
        .map((x) => x.i);
      displayCols = order.map((i) => corrData.columns[i]);
      displayMatrix = order.map((i) => order.map((j) => corrData.matrix[i][j]));
    }
  }

  const labelFor = (col: string) => HOUSEHOLD_COLUMNS.find((c) => c.key === col)?.label ?? col;

  return (
    <div>
      <PageHeader
        title="Correlation Heatmap"
        subtitle="Pearson correlations between all 28 household variables. Click a cell to see the scatter plot."
      />

      <div className="mb-4 flex items-center gap-4">
        <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
          <input
            type="checkbox"
            checked={sortByIncome}
            onChange={(e) => setSortByIncome(e.target.checked)}
            className="rounded"
          />
          Sort by correlation with income
        </label>
        <div className="ml-auto flex items-center gap-2 text-xs text-slate-400">
          <span>–1</span>
          <div className="w-32 h-3 rounded" style={{ background: 'linear-gradient(to right, rgb(55,55,255), white, rgb(255,55,55))' }} />
          <span>+1</span>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white overflow-auto">
        <div className="p-4" style={{ minWidth: 600 }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: `80px repeat(${displayCols.length}, 1fr)`,
              gap: 1,
              fontSize: 10,
            }}
          >
            {/* Header row */}
            <div />
            {displayCols.map((col) => (
              <div
                key={col}
                className="text-center text-slate-400 overflow-hidden"
                style={{
                  writingMode: 'vertical-rl',
                  transform: 'rotate(180deg)',
                  height: 70,
                  paddingBottom: 4,
                  fontSize: 9,
                }}
                title={labelFor(col)}
              >
                {labelFor(col).slice(0, 16)}
              </div>
            ))}

            {/* Data rows */}
            {displayCols.map((rowCol, i) => (
              <>
                <div
                  key={`label-${rowCol}`}
                  className="text-right text-slate-400 pr-2 flex items-center justify-end"
                  style={{ fontSize: 9 }}
                  title={labelFor(rowCol)}
                >
                  {labelFor(rowCol).slice(0, 18)}
                </div>
                {displayCols.map((colCol, j) => {
                  const r = displayMatrix[i][j];
                  const isHov = hovered?.i === i && hovered?.j === j;
                  return (
                    <div
                      key={`${rowCol}-${colCol}`}
                      style={{
                        background: getColor(r),
                        cursor: i !== j ? 'pointer' : 'default',
                        outline: isHov ? '2px solid #1e40af' : 'none',
                        transition: 'outline 0.1s',
                        height: 18,
                      }}
                      title={`${labelFor(rowCol)} vs ${labelFor(colCol)}: r = ${r.toFixed(3)}`}
                      onMouseEnter={() => setHovered({ i, j })}
                      onMouseLeave={() => setHovered(null)}
                      onClick={() => {
                        if (i !== j) {
                          setModal({ xCol: displayCols[j], yCol: displayCols[i] });
                        }
                      }}
                    />
                  );
                })}
              </>
            ))}
          </div>
        </div>
      </div>

      {/* Tooltip info */}
      {hovered && (
        <div className="mt-3 rounded-lg bg-slate-50 border border-slate-200 px-4 py-2 text-sm text-slate-600">
          <strong>{labelFor(displayCols[hovered.i])}</strong>
          {' vs '}
          <strong>{labelFor(displayCols[hovered.j])}</strong>
          {': r = '}
          <strong>{displayMatrix[hovered.i][hovered.j].toFixed(4)}</strong>
          {hovered.i !== hovered.j && ' — click to view scatter plot'}
        </div>
      )}

      {/* Scatter modal */}
      {modal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setModal(null)}
        >
          <div
            className="bg-white rounded-2xl p-6 w-full max-w-2xl shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-900">
                {HOUSEHOLD_COLUMNS.find((c) => c.key === modal.xCol)?.label} vs{' '}
                {HOUSEHOLD_COLUMNS.find((c) => c.key === modal.yCol)?.label}
              </h3>
              <button onClick={() => setModal(null)} className="text-slate-400 hover:text-slate-600">
                ✕
              </button>
            </div>
            {!scatterData ? (
              scatterError ? (
                <ErrorState compact message={getErrorMessage(scatterError, 'Unable to load the comparison scatter data.')} />
              ) : (
                <div className="flex items-center justify-center h-64 text-slate-400">Loading...</div>
              )
            ) : (
              <div className="h-64 flex items-center justify-center text-slate-400 text-sm">
                {scatterData.length} points — X: {modal.xCol} | Y: {modal.yCol}
                <br />
                (Full scatter chart available on the Feature Explorer page)
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
