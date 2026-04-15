import { NextResponse } from 'next/server';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export interface ForecastPoint {
  marz: string;
  year: number;
  poverty_rate: number;
  stress_index: number;
  poverty_low: number | null;
  poverty_high: number | null;
  stress_low: number | null;
  stress_high: number | null;
  is_forecast: boolean;
}

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i += 1; }
      else inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      values.push(current); current = '';
    } else {
      current += char;
    }
  }
  values.push(current);
  return values;
}

function parseNum(s: string): number | null {
  if (!s || s.trim() === '') return null;
  const n = Number(s);
  return isNaN(n) ? null : n;
}

export async function GET() {
  const csvPath = join(process.cwd(), '..', 'data', 'processed', 'results', 'forecast_2023_2026.csv');

  if (!existsSync(csvPath)) {
    return NextResponse.json({ error: `CSV not found: ${csvPath}` }, { status: 500 });
  }

  const text = readFileSync(csvPath, 'utf8').trim();
  const [headerLine, ...lines] = text.split(/\r?\n/);
  const headers = parseCsvLine(headerLine);

  const rows: ForecastPoint[] = lines
    .filter(Boolean)
    .map((line) => {
      const values = parseCsvLine(line);
      const obj = Object.fromEntries(
        headers.map((h, i) => [h, values[i] ?? ''])
      ) as Record<string, string>;
      return {
        marz: obj.marz,
        year: Number(obj.year),
        poverty_rate: Number(obj.poverty_rate),
        stress_index: Number(obj.stress_index),
        poverty_low: parseNum(obj.poverty_low),
        poverty_high: parseNum(obj.poverty_high),
        stress_low: parseNum(obj.stress_low),
        stress_high: parseNum(obj.stress_high),
        is_forecast: obj.is_forecast === '1',
      };
    });

  return NextResponse.json(rows);
}
