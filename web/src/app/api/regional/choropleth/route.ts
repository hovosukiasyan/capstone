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
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
