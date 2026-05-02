import { NextResponse } from 'next/server';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export interface RollingRow {
  marz: string;
  target: string;
  train_end: number;
  test_year: number;
  actual: number;
  predicted: number;
  signed_error: number;
  absolute_error: number;
  percent_error: number;
  model: string;
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

function parseNum(s: string): number {
  const n = Number(s);
  return isNaN(n) ? 0 : n;
}

export async function GET() {
  const csvPath = join(process.cwd(), '..', 'data', 'processed', 'results', 'forecast_rolling_validation.csv');

  if (!existsSync(csvPath)) {
    return NextResponse.json({ error: `CSV not found: ${csvPath}` }, { status: 500 });
  }

  const text = readFileSync(csvPath, 'utf8').trim();
  const [headerLine, ...lines] = text.split(/\r?\n/);
  const headers = parseCsvLine(headerLine);

  const rows: RollingRow[] = lines
    .filter(Boolean)
    .map((line) => {
      const values = parseCsvLine(line);
      const obj = Object.fromEntries(
        headers.map((h, i) => [h, values[i] ?? ''])
      ) as Record<string, string>;
      return {
        marz:           obj.marz,
        target:         obj.target,
        train_end:      parseNum(obj.train_end),
        test_year:      parseNum(obj.test_year),
        actual:         parseNum(obj.actual),
        predicted:      parseNum(obj.predicted),
        signed_error:   parseNum(obj.signed_error),
        absolute_error: parseNum(obj.absolute_error),
        percent_error:  parseNum(obj.percent_error),
        model:          obj.model,
      };
    });

  return NextResponse.json(rows);
}
