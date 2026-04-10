import { NextResponse } from 'next/server';
import { getHouseholdStats } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    const stats = await getHouseholdStats();
    return NextResponse.json(stats);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
