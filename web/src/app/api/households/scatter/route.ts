import { NextRequest, NextResponse } from 'next/server';
import { getScatterPoints } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const ALLOWED_COLUMNS = new Set([
  'household_income_total', 'household_income_source_count', 'household_size',
  'food_purchases_total', 'services_goods_total', 'goods_services_total',
  'amd_3', 'money_family_need_monthly_live', 'money_family_need_monthly_make',
  'drm_in_amd', 'family_debt_amount', 'heating_spend_last_winter_amd',
  'potable_water_hours_day', 'number_of_rooms', 'dwelling_ownership',
  'dwelling_condition_estimate', 'registered_poverty_benefit',
  'log_income', 'interview_month',
]);

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const x = searchParams.get('x') ?? 'food_purchases_total';
  const y = searchParams.get('y') ?? 'household_income_total';
  const colorBy = searchParams.get('color_by') ?? 'household_income_source_count';
  const pMin = parseFloat(searchParams.get('p_min') ?? '1');
  const pMax = parseFloat(searchParams.get('p_max') ?? '99');

  if (!ALLOWED_COLUMNS.has(x) || !ALLOWED_COLUMNS.has(y) || !ALLOWED_COLUMNS.has(colorBy)) {
    return NextResponse.json({ error: 'Invalid column' }, { status: 400 });
  }

  try {
    const points = await getScatterPoints(x, y, colorBy, pMin, pMax);
    return NextResponse.json(points);
  } catch (err) {
    const e = err as Error & { code?: string; detail?: string };
    console.error('[api/households/scatter]', { message: e?.message, code: e?.code, detail: e?.detail, stack: e?.stack });
    return NextResponse.json({ error: e?.message ?? String(err), code: e?.code, detail: e?.detail }, { status: 500 });
  }
}
