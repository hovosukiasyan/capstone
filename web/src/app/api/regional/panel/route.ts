import { NextRequest, NextResponse } from 'next/server';
import { getRegionalPanel } from '@/lib/csv-data';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const marzParam = searchParams.get('marz') ?? '';
  const marzes = marzParam ? marzParam.split(',').map((m) => m.trim()) : [];
  const yearFrom = parseInt(searchParams.get('year_from') ?? '2016', 10);
  const yearTo = parseInt(searchParams.get('year_to') ?? '2022', 10);
  const indicator = searchParams.get('indicator') ?? 'poverty_rate';

  try {
    const data = await getRegionalPanel(marzes, yearFrom, yearTo, indicator);
    return NextResponse.json(data);
  } catch (err) {
    const e = err as Error & { code?: string; detail?: string };
    console.error('[api/regional/panel]', { message: e?.message, code: e?.code, detail: e?.detail, stack: e?.stack });
    return NextResponse.json({ error: e?.message ?? String(err), code: e?.code, detail: e?.detail }, { status: 500 });
  }
}
