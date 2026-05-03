import { NextResponse } from 'next/server';
import { getModelMetrics } from '@/lib/csv-data';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    const data = await getModelMetrics();
    return NextResponse.json(data);
  } catch (err) {
    const e = err as Error & { code?: string; detail?: string };
    console.error('[api/models/metrics]', { message: e?.message, code: e?.code, detail: e?.detail, stack: e?.stack });
    return NextResponse.json({ error: e?.message ?? String(err), code: e?.code, detail: e?.detail }, { status: 500 });
  }
}
