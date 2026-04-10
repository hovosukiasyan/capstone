import { NextRequest, NextResponse } from 'next/server';
import { getFeatureImportance } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const model = searchParams.get('model') ?? 'gbm';
  const topN = parseInt(searchParams.get('top_n') ?? '28', 10);

  try {
    const data = await getFeatureImportance(model, topN);
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
