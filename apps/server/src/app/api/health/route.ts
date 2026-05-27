import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getLogger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface HealthBody {
  status: 'ok' | 'degraded';
  uptimeSeconds: number;
  checks: {
    database: { ok: boolean; latencyMs?: number; error?: string };
  };
}

export async function GET() {
  const log = getLogger();

  const dbStart = Date.now();
  let dbOk = false;
  let dbError: string | undefined;
  try {
    await prisma.$queryRawUnsafe('SELECT 1');
    dbOk = true;
  } catch (err) {
    dbError = err instanceof Error ? err.message : 'unknown';
    log.warn({ event: 'health.db.fail', err: dbError }, 'Health DB ping failed');
  }
  const dbLatency = Date.now() - dbStart;

  const body: HealthBody = {
    status: dbOk ? 'ok' : 'degraded',
    uptimeSeconds: Math.round(process.uptime()),
    checks: {
      database: dbOk
        ? { ok: true, latencyMs: dbLatency }
        : { ok: false, error: dbError ?? 'unknown' },
    },
  };

  return NextResponse.json(body, { status: dbOk ? 200 : 503 });
}
