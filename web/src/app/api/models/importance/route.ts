import { NextRequest, NextResponse } from 'next/server';
import { getFeatureImportance } from '@/lib/csv-data';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const model = searchParams.get('model') ?? 'gbm';
  const topN = parseInt(searchParams.get('top_n') ?? '28', 10);

  try {
    const data = await getFeatureImportance(model, topN);
    return NextResponse.json(data);
  } catch (err) {
    const e = err as Error & { code?: string; detail?: string };
    console.error('[api/models/importance]', { message: e?.message, code: e?.code, detail: e?.detail, stack: e?.stack });
    return NextResponse.json({ error: e?.message ?? String(err), code: e?.code, detail: e?.detail }, { status: 500 });
  }
}
