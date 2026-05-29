/**
 * Audit-log retention job.
 *
 * Deletes audit rows past their per-class retention window:
 *  - routine bookkeeping events older than AUDIT_RETENTION_ROUTINE_DAYS (default 90)
 *  - security/forensics events (CRITICAL_EVENTS) older than
 *    AUDIT_RETENTION_CRITICAL_DAYS (default 365)
 *
 * Keeps the AuditLog table from growing without bound while preserving the
 * security-relevant trail. Idempotent; safe to run repeatedly.
 *
 * Usage: `pnpm tsx scripts/prune-audit-log.ts`
 * Designed to be invoked from a host-level cron once a day.
 */
import { prisma } from '../src/lib/prisma';
import { getEnv } from '../src/lib/env';
import { pruneAuditLog } from '../src/lib/services/audit-retention';

async function main() {
  const env = getEnv();
  const now = new Date();
  const res = await pruneAuditLog({
    now,
    routineDays: env.AUDIT_RETENTION_ROUTINE_DAYS,
    criticalDays: env.AUDIT_RETENTION_CRITICAL_DAYS,
  });
  console.log(
    JSON.stringify({
      event: 'audit_prune.done',
      now: now.toISOString(),
      routineDeleted: res.routineDeleted,
      criticalDeleted: res.criticalDeleted,
      routineCutoff: res.routineCutoff.toISOString(),
      criticalCutoff: res.criticalCutoff.toISOString(),
    }),
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
