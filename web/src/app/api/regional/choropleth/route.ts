import { NextRequest, NextResponse } from 'next/server';
import { getChoroplethData } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const indicator = searchParams.get('indicator') ?? 'poverty_rate';
  const yearParam = searchParams.get('year') ?? 'avg';
  const year = yearParam === 'avg' ? 'avg' : parseInt(yearParam, 10);

  try {
    const data = await getChoroplethData(indicator, year);
    return NextResponse.json(data);
  } catch (err) {
    const e = err as Error & { code?: string; detail?: string };
    console.error('[api/regional/choropleth]', { message: e?.message, code: e?.code, detail: e?.detail, stack: e?.stack });
    return NextResponse.json({ error: e?.message ?? String(err), code: e?.code, detail: e?.detail }, { status: 500 });
  }
}
