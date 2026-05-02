import { NextResponse } from 'next/server';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export interface GRUDailyRow {
  date: string;
  marz: string;
  actual: number;
  predicted: number;
}

function parseNum(s: string): number {
  const n = Number(s);
  return isNaN(n) ? 0 : n;
}

export async function GET() {
  const csvPath = join(process.cwd(), '..', 'data', 'processed', 'results', 'gru_daily_validation_2022.csv');

  if (!existsSync(csvPath)) {
    return NextResponse.json({ error: `CSV not found: ${csvPath}` }, { status: 500 });
  }

  const text = readFileSync(csvPath, 'utf8').trim();
  const [, ...lines] = text.split(/\r?\n/);

  const rows: GRUDailyRow[] = lines
    .filter(Boolean)
    .map((line) => {
      const [date, marz, actual, predicted] = line.split(',');
      return {
        date,
        marz,
        actual:    parseNum(actual),
        predicted: parseNum(predicted),
      };
    });

  return NextResponse.json(rows);
}
