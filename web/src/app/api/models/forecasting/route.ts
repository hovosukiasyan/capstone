import { NextRequest, NextResponse } from 'next/server';
import { getForecastingResults } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const source = searchParams.get('source') ?? 'poverty';

  try {
    const data = await getForecastingResults(source);
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
