import { NextRequest, NextResponse } from 'next/server';
import { getHouseholdList } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const page = parseInt(searchParams.get('page') ?? '1', 10);
  const perPage = Math.min(parseInt(searchParams.get('per_page') ?? '50', 10), 200);
  const sortCol = searchParams.get('sort_col') ?? 'id';
  const sortDir = (searchParams.get('sort_dir') ?? 'asc') as 'asc' | 'desc';
  const incomeMin = searchParams.get('income_min') ? parseFloat(searchParams.get('income_min')!) : undefined;
  const incomeMax = searchParams.get('income_max') ? parseFloat(searchParams.get('income_max')!) : undefined;
  const sizeMin = searchParams.get('size_min') ? parseInt(searchParams.get('size_min')!, 10) : undefined;
  const sizeMax = searchParams.get('size_max') ? parseInt(searchParams.get('size_max')!, 10) : undefined;

  try {
    const result = await getHouseholdList(page, perPage, sortCol, sortDir, incomeMin, incomeMax, sizeMin, sizeMax);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
