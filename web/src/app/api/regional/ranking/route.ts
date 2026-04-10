import { NextRequest, NextResponse } from 'next/server';
import { getRegionalRanking } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const indicator = searchParams.get('indicator') ?? 'poverty_rate';
  const year = parseInt(searchParams.get('year') ?? '2022', 10);

  try {
    const data = await getRegionalRanking(indicator, year);
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
