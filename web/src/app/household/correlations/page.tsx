'use client';

import React, { useState, useEffect } from 'react';
import useSWR from 'swr';
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ZAxis,
} from 'recharts';
import ErrorState from '@/components/layout/ErrorState';
import PageHeader from '@/components/layout/PageHeader';
import { HOUSEHOLD_COLUMNS } from '@/lib/constants';
import { apiFetcher, getErrorMessage } from '@/lib/fetcher';
import { formatAMD } from '@/lib/utils';
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

function getColMeta(col: string) {
  return HOUSEHOLD_COLUMNS.find((c) => c.key === col);
}

function isBinary(col: string) {
  return getColMeta(col)?.type === 'binary';
}

function isMonetary(col: string) {
  return getColMeta(col)?.type === 'monetary';
}

function formatAxisValue(col: string, v: number) {
  if (isMonetary(col)) return formatAMD(v, true);
  return String(Math.round(v));
}

export default function CorrelationsPage() {
  const [corrData, setCorrData] = useState<CorrelationData | null>(null);
  const [corrError, setCorrError] = useState<string | null>(null);
  const [sortByIncome, setSortByIncome] = useState(true);
  const [hovered, setHovered] = useState<{ i: number; j: number } | null>(null);
  const [modal, setModal] = useState<{ xCol: string; yCol: string } | null>(null);

  const { data: scatterData, error: scatterError, isLoading: scatterLoading } = useSWR<ScatterPoint[]>(
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

  const bothBinary = modal ? (isBinary(modal.xCol) && isBinary(modal.yCol)) : false;

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
              >
                {labelFor(col).slice(0, 16)}
              </div>
            ))}

            {/* Data rows */}
            {displayCols.map((rowCol, i) => (
              <React.Fragment key={rowCol}>
                <div
                  className="text-right text-slate-400 pr-2 flex items-center justify-end"
                  style={{ fontSize: 9 }}
                >
                  {labelFor(rowCol).slice(0, 18)}
                </div>
                {displayCols.map((colCol, j) => {
                  const r = displayMatrix[i][j];
                  const isHov = hovered?.i === i && hovered?.j === j;
                  return (
                    <div
                      key={`${rowCol}-${colCol}`}
                      aria-label={`${labelFor(rowCol)} vs ${labelFor(colCol)}: r = ${r.toFixed(3)}`}
                      style={{
                        background: getColor(r),
                        cursor: i !== j ? 'pointer' : 'default',
                        outline: isHov ? '2px solid #1e40af' : 'none',
                        transition: 'outline 0.1s',
                        height: 18,
                      }}
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
              </React.Fragment>
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
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-semibold text-slate-900">
                {labelFor(modal.xCol)} vs {labelFor(modal.yCol)}
              </h3>
              <button onClick={() => setModal(null)} className="text-slate-400 hover:text-slate-600 text-lg leading-none">
                ✕
              </button>
            </div>

            {modal && corrData && (() => {
              const xi = corrData.columns.indexOf(modal.xCol);
              const yi = corrData.columns.indexOf(modal.yCol);
              const r = xi !== -1 && yi !== -1 ? corrData.matrix[yi][xi] : null;
              return r !== null ? (
                <p className="text-xs text-slate-400 mb-4">
                  Pearson r = <strong className="text-slate-600">{r.toFixed(4)}</strong>
                  {' · '}
                  {scatterData ? `${scatterData.length.toLocaleString()} points (p1–p99 trimmed)` : ''}
                </p>
              ) : null;
            })()}

            {bothBinary && (
              <div className="mb-3 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700">
                Both variables are binary (Yes/No). The scatter shows income source count distribution across response groups.
              </div>
            )}

            {scatterLoading ? (
              <div className="flex items-center justify-center h-64 text-slate-400 text-sm">Loading...</div>
            ) : scatterError ? (
              <ErrorState compact message={getErrorMessage(scatterError, 'Unable to load scatter data.')} />
            ) : scatterData && scatterData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <ScatterChart margin={{ top: 10, right: 20, left: 10, bottom: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis
                    type="number"
                    dataKey="x"
                    tick={{ fontSize: 10, fill: '#94a3b8' }}
                    tickLine={false}
                    tickFormatter={(v) => formatAxisValue(modal.xCol, v)}
                    label={{ value: labelFor(modal.xCol), position: 'insideBottom', offset: -20, fontSize: 10, fill: '#94a3b8' }}
                  />
                  <YAxis
                    type="number"
                    dataKey="y"
                    tick={{ fontSize: 10, fill: '#94a3b8' }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => formatAxisValue(modal.yCol, v)}
                    label={{ value: labelFor(modal.yCol), angle: -90, position: 'insideLeft', fontSize: 10, fill: '#94a3b8' }}
                  />
                  <ZAxis range={[12, 12]} />
                  <Tooltip
                    contentStyle={{ background: '#1e293b', border: 'none', borderRadius: 8, fontSize: 11, color: '#f8fafc' }}
                    cursor={false}
                    formatter={(v: unknown, name: unknown) => {
                      const col = name === 'x' ? modal.xCol : modal.yCol;
                      return [formatAxisValue(col, Number(v)), labelFor(col)];
                    }}
                  />
                  <Scatter
                    data={scatterData}
                    shape={(props: { cx?: number; cy?: number; payload?: ScatterPoint }) => {
                      const { cx = 0, cy = 0, payload } = props;
                      // Color by income source count: 1–6 mapped warm→cool
                      const cv = payload?.color_value ?? 1;
                      const t = Math.min(Math.max((cv - 1) / 5, 0), 1);
                      const r = Math.round(59 + t * (239 - 59));
                      const g = Math.round(130 + t * (68 - 130));
                      const b = Math.round(246 + t * (68 - 246));
                      return <circle cx={cx} cy={cy} r={2.5} fill={`rgb(${r},${g},${b})`} fillOpacity={0.45} />;
                    }}
                  />
                </ScatterChart>
              </ResponsiveContainer>
            ) : scatterData && scatterData.length === 0 ? (
              <div className="flex items-center justify-center h-64 text-slate-400 text-sm">No data points returned.</div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
