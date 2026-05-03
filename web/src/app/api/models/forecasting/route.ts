import { NextRequest, NextResponse } from 'next/server';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type ForecastRow = {
  source: string;
  model: string;
  frequency: string | null;
  r2: number | null;
  mae: number | null;
};

function parseNum(v: string | undefined): number | null {
  if (v === undefined || v === '' || v.toLowerCase() === 'na') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

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

function readCsv(filePath: string): Record<string, string>[] {
  if (!existsSync(filePath)) throw new Error(`CSV not found: ${filePath}`);
  const text = readFileSync(filePath, 'utf8').trim();
  const [headerLine, ...lines] = text.split(/\r?\n/);
  const headers = parseCsvLine(headerLine);
  return lines
    .filter(Boolean)
    .map((line) => {
      const values = parseCsvLine(line);
      return Object.fromEntries(headers.map((h, i) => [h, values[i] ?? '']));
    });
}

const RESULTS_DIR = join(process.cwd(), '..', 'data', 'processed', 'results');

function loadFromCsv(source: string): ForecastRow[] {
  const csvMap: Record<string, string> = {
    poverty:              'poverty_forecasting_results.csv',
    stress:               'stress_forecasting_results.csv',
    augmentation_baseline:'augmentation_baseline_results.csv',
    augmentation_nn:      'augmentation_nn_results.csv',
    time_series_classical:'ts_classical_results.csv',
    time_series_nn:       'ts_nn_results.csv',
    poverty_nn_activation:'poverty_nn_activation_sweep.csv',
    poverty_nn_layer:     'poverty_nn_layer_size_sweep.csv',
  };

  const fileName = csvMap[source];
  if (!fileName) throw new Error(`Unknown source: ${source}`);
  const rows = readCsv(join(RESULTS_DIR, fileName));

  return rows
    .map((r): ForecastRow => {
      // sources where model name comes from the row's own source column
      if (source === 'time_series_classical' || source === 'time_series_nn') {
        const m = r.model ?? r.Model ?? '';
        const tgt = r.target ?? r.Target ?? '';
        return {
          source: r.source ?? source,
          model: tgt ? `${m} (${tgt})` : m,
          frequency: r.frequency ?? r.Frequency ?? null,
          r2: parseNum(r.R2 ?? r.r2),
          mae: parseNum(r.MAE ?? r.mae),
        };
      }

      if (source === 'augmentation_baseline') {
        return {
          source,
          model: 'Lag-1 Baseline',
          frequency: r.frequency ?? null,
          r2: parseNum(r.r2),
          mae: parseNum(r.mae),
        };
      }

      if (source === 'augmentation_nn') {
        return {
          source,
          model: String(r.architecture ?? ''),
          frequency: r.frequency ?? null,
          r2: parseNum(r.r2),
          mae: parseNum(r.mae),
        };
      }

      if (source === 'poverty_nn_activation') {
        const hiddenDims = r.hidden_dims === 'na' ? '' : (r.hidden_dims ?? '').replace(/x/g, '→');
        const activation = r.activation === 'na' ? '' : (r.activation ?? '').toUpperCase();
        const model = r.model === 'baseline' ? 'Lag-1 Baseline' : `MLP · ${activation} · ${hiddenDims}`;
        return { source, model, frequency: null, r2: parseNum(r.r2), mae: parseNum(r.mae) };
      }

      if (source === 'poverty_nn_layer') {
        const hiddenDims = r.hidden_dims === 'na' ? '' : (r.hidden_dims ?? '').replace(/x/g, '→');
        const activation = r.activation === 'na' ? '' : (r.activation ?? '').toUpperCase();
        const layerCount = r.layer_count ? Number(r.layer_count) : hiddenDims ? hiddenDims.split('→').length : 0;
        const units = r.total_units ? ` · ${r.total_units} units` : '';
        const model = r.model === 'baseline' ? 'Lag-1 Baseline'
          : `MLP · ${layerCount} layer${layerCount === 1 ? '' : 's'} · ${activation} · ${hiddenDims}${units}`;
        return { source, model, frequency: null, r2: parseNum(r.r2), mae: parseNum(r.mae) };
      }

      // poverty, stress — simple Model/R2/MAE columns, no frequency
      return {
        source,
        model: r.Model ?? r.model ?? '',
        frequency: null,
        r2: parseNum(r.R2 ?? r.r2),
        mae: parseNum(r.MAE ?? r.mae),
      };
    })
    .sort((a, b) => (b.r2 ?? -Infinity) - (a.r2 ?? -Infinity));
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const source = searchParams.get('source') ?? 'poverty';

  try {
    return NextResponse.json(loadFromCsv(source));
  } catch (err) {
    const e = err as Error;
    console.error('[api/models/forecasting]', e?.message);
    return NextResponse.json({ error: e?.message ?? String(err) }, { status: 500 });
  }
}
