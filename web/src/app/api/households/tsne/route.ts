import { NextResponse } from 'next/server';
import { getTsnePoints } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    const points = await getTsnePoints();
    return NextResponse.json(points);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
