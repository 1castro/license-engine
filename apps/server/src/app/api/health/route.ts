import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getLogger } from '@/lib/logger';
import { getKeyProvider } from '@/lib/crypto';
import { getLatestAuditLogTimestamp } from '@/lib/services/audit-log-service';
import { getMailSender } from '@/lib/mail/mail-sender';
import { SmtpMailSender } from '@/lib/mail/smtp-mail-sender';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface CheckResult {
  ok: boolean;
  detail?: string;
  latencyMs?: number;
}

interface HealthBody {
  status: 'ok' | 'degraded';
  uptimeSeconds: number;
  checks: {
    database: CheckResult;
    kek: CheckResult;
    signingKeys: CheckResult & { productsWithoutActiveKey?: number };
    auditLog: CheckResult & { latestEventAgoSeconds?: number | null };
    mail: CheckResult & { transport?: string };
  };
}

async function checkDb(): Promise<CheckResult> {
  const t0 = Date.now();
  try {
    await prisma.$queryRawUnsafe('SELECT 1');
    return { ok: true, latencyMs: Date.now() - t0 };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : 'unknown' };
  }
}

async function checkKek(): Promise<CheckResult> {
  const t0 = Date.now();
  try {
    const key = await getKeyProvider().getEncryptionKey();
    if (key.byteLength !== 32) {
      return { ok: false, detail: `KEK length ${key.byteLength} != 32` };
    }
    return { ok: true, latencyMs: Date.now() - t0 };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : 'unknown' };
  }
}

async function checkSigningKeyCoverage(): Promise<CheckResult & { productsWithoutActiveKey?: number }> {
  try {
    const products = await prisma.product.findMany({
      select: { id: true, slug: true, activeSigningKeyId: true },
    });
    const without = products.filter((p) => p.activeSigningKeyId === null);
    if (without.length > 0) {
      return {
        ok: false,
        detail: `Products without active signing key: ${without.map((p) => p.slug).join(', ')}`,
        productsWithoutActiveKey: without.length,
      };
    }
    return { ok: true, productsWithoutActiveKey: 0 };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : 'unknown' };
  }
}

async function checkMail(): Promise<CheckResult & { transport?: string }> {
  const sender = getMailSender();
  if (sender instanceof SmtpMailSender) {
    const probe = await sender.healthProbe();
    return probe.ok
      ? { ok: true, transport: sender.transport }
      : { ok: false, transport: sender.transport, detail: probe.error };
  }
  // ConsoleMailSender is always "ok" but we surface the transport so an
  // operator notices when production is accidentally running on console.
  return { ok: true, transport: sender.transport };
}

async function checkAuditLog(): Promise<CheckResult & { latestEventAgoSeconds?: number | null }> {
  try {
    const ts = await getLatestAuditLogTimestamp();
    if (!ts) {
      return { ok: true, latestEventAgoSeconds: null, detail: 'No events yet (fresh deploy)' };
    }
    return { ok: true, latestEventAgoSeconds: Math.round((Date.now() - ts.getTime()) / 1000) };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : 'unknown' };
  }
}

export async function GET() {
  const log = getLogger();
  const [database, kek, signingKeys, auditLog, mail] = await Promise.all([
    checkDb(),
    checkKek(),
    checkSigningKeyCoverage(),
    checkAuditLog(),
    checkMail(),
  ]);

  const checks = { database, kek, signingKeys, auditLog, mail };
  const allOk = Object.values(checks).every((c) => c.ok);

  if (!allOk) {
    log.warn({ event: 'health.degraded', checks }, 'Health check degraded');
  }

  const body: HealthBody = {
    status: allOk ? 'ok' : 'degraded',
    uptimeSeconds: Math.round(process.uptime()),
    checks,
  };
  return NextResponse.json(body, { status: allOk ? 200 : 503 });
}
