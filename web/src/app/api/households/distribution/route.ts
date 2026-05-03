import { NextRequest, NextResponse } from 'next/server';
import { getHouseholdDistribution } from '@/lib/csv-data';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const column = searchParams.get('column') ?? 'household_income_total';
  const bins = parseInt(searchParams.get('bins') ?? '50', 10);

  const ALLOWED_COLUMNS = new Set([
    'household_income_total', 'household_income_source_count', 'household_size',
    'food_purchases_total', 'services_goods_total', 'goods_services_total',
    'amd_3', 'money_family_need_monthly_live', 'money_family_need_monthly_make',
    'drm_in_amd', 'family_debt_amount', 'heating_spend_last_winter_amd',
    'potable_water_hours_day', 'number_of_rooms', 'dwelling_ownership',
    'dwelling_condition_estimate', 'registered_poverty_benefit',
    'share_families_really_vulnerable', 'has_computer', 'household_has_car',
    'dwelling_renovated', 'building_new_house', 'household_sent_money_goods_12m',
    'household_received_money_goods_12m', 'lent_money_12m', 'borrowed_money_12m',
    'humanitarian_assistance_12m', 'has_other_dwelling', 'interview_month',
  ]);

  if (!ALLOWED_COLUMNS.has(column)) {
    return NextResponse.json({ error: 'Invalid column' }, { status: 400 });
  }

  try {
    const result = await getHouseholdDistribution(column, bins);
    return NextResponse.json(result);
  } catch (err) {
    const e = err as Error & { code?: string; detail?: string };
    console.error('[api/households/distribution]', { message: e?.message, code: e?.code, detail: e?.detail, stack: e?.stack });
    return NextResponse.json({ error: e?.message ?? String(err), code: e?.code, detail: e?.detail }, { status: 500 });
  }
}
