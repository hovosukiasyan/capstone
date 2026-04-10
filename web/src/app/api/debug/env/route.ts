import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function maskValue(val: string): string {
  if (!val) return '';
  try {
    const u = new URL(val);
    const host = u.hostname;
    const user = u.username ? u.username.slice(0, 4) + '***' : '';
    return `${u.protocol}//${user ? user + '@' : ''}${host}:${u.port || '(default)'}/${u.pathname.replace(/^\//, '')} [${val.length} chars]`;
  } catch {
    // Not a URL — just mask the middle
    if (val.length <= 8) return '***';
    return val.slice(0, 4) + '***' + val.slice(-4) + ` [${val.length} chars]`;
  }
}

export async function GET() {
  const DB_KEYS = [
    'DATABASE_URL',
    'DATABASE_URL_UNPOOLED',
    'POSTGRES_URL',
    'POSTGRES_URL_NON_POOLING',
    'POSTGRES_PRISMA_URL',
    'NEON_DATABASE_URL',
    'PGHOST',
    'PGUSER',
    'PGDATABASE',
    'PGPORT',
  ];

  const report: Record<string, string> = {};
  for (const key of DB_KEYS) {
    const val = process.env[key];
    report[key] = val ? maskValue(val) : 'NOT SET';
  }

  // Also report node version and runtime info
  const meta = {
    node_version: process.version,
    platform: process.platform,
    env: process.env.NODE_ENV,
    vercel_env: process.env.VERCEL_ENV ?? 'not set',
    vercel_region: process.env.VERCEL_REGION ?? 'not set',
  };

  console.log('[debug/env] env check:', report);

  return NextResponse.json({ vars: report, meta });
}
