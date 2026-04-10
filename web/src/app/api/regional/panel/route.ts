import { NextRequest, NextResponse } from 'next/server';
import { getRegionalPanel } from '@/lib/db';

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
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
