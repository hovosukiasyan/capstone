import { NextRequest, NextResponse } from 'next/server';
import { getForecastingResults } from '@/lib/db';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type SweepRow = {
  source: string;
  model: string;
  frequency: string | null;
  r2: number | null;
  mae: number | null;
};

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      values.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  values.push(current);
  return values;
}

function loadSweepResults(source: 'poverty_nn_activation' | 'poverty_nn_layer'): SweepRow[] {
  const fileName =
    source === 'poverty_nn_activation'
      ? 'poverty_nn_activation_sweep.csv'
      : 'poverty_nn_layer_size_sweep.csv';
  const csvPath = join(process.cwd(), '..', 'data', 'processed', 'results', fileName);

  if (!existsSync(csvPath)) {
    throw new Error(`Sweep CSV not found: ${csvPath}`);
  }

  const text = readFileSync(csvPath, 'utf8').trim();
  const [headerLine, ...lines] = text.split(/\r?\n/);
  const headers = parseCsvLine(headerLine);

  const rows = lines
    .filter(Boolean)
    .map((line) => {
      const values = parseCsvLine(line);
      const row = Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])) as Record<string, string>;
      const hiddenDims = row.hidden_dims === 'na' ? '' : row.hidden_dims.replace(/x/g, '→');
      const activation = row.activation === 'na' ? '' : row.activation.toUpperCase();
      const layerCount = row.layer_count ? Number(row.layer_count) : hiddenDims ? hiddenDims.split('→').length : 0;

      let modelLabel = row.model;
      if (row.model === 'baseline') {
        modelLabel = 'Lag-1 Baseline';
      } else if (source === 'poverty_nn_activation') {
        modelLabel = `MLP · ${activation} · ${hiddenDims}`;
      } else {
        const units = row.total_units ? ` · ${row.total_units} units` : '';
        modelLabel = `MLP · ${layerCount} layer${layerCount === 1 ? '' : 's'} · ${activation} · ${hiddenDims}${units}`;
      }

      return {
        source,
        model: modelLabel,
        frequency: null,
        r2: row.r2 ? Number(row.r2) : null,
        mae: row.mae ? Number(row.mae) : null,
      };
    })
    .sort((a, b) => (b.r2 ?? -Infinity) - (a.r2 ?? -Infinity));

  return rows;
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const source = searchParams.get('source') ?? 'poverty';

  try {
    if (source === 'poverty_nn_activation' || source === 'poverty_nn_layer') {
      return NextResponse.json(loadSweepResults(source));
    }
    const data = await getForecastingResults(source);
    return NextResponse.json(data);
  } catch (err) {
    const e = err as Error & { code?: string; detail?: string };
    console.error('[api/models/forecasting]', { message: e?.message, code: e?.code, detail: e?.detail, stack: e?.stack });
    return NextResponse.json({ error: e?.message ?? String(err), code: e?.code, detail: e?.detail }, { status: 500 });
  }
}
