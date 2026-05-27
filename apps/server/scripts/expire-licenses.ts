/**
 * License-Expiry-Job.
 *
 * Flips every active License whose `expiresAt` has already elapsed to
 * `expired` state and writes one `LicenseExpired` audit entry per row.
 *
 * Idempotent: only rows still in state `active` are flipped, so a cron run
 * that overlaps with the lazy-flip in the public API does not double-count.
 *
 * Usage: `pnpm tsx scripts/expire-licenses.ts`
 * Designed to be invoked from a host-level cron once a day at minute 0.
 */
import { LicenseStatus, PrismaClient } from '@prisma/client';
import { writeAuditLog, AuditEventType } from '../src/lib/audit';

const prisma = new PrismaClient();

async function main() {
  const now = new Date();
  const candidates = await prisma.license.findMany({
    where: { status: LicenseStatus.active, expiresAt: { not: null, lte: now } },
    select: { id: true, expiresAt: true },
  });

  if (candidates.length === 0) {
    console.log(JSON.stringify({ event: 'expire.no_candidates', now: now.toISOString() }));
    return;
  }

  let flipped = 0;
  for (const c of candidates) {
    const res = await prisma.license.updateMany({
      where: { id: c.id, status: LicenseStatus.active },
      data: { status: LicenseStatus.expired },
    });
    if (res.count === 1) {
      flipped += 1;
      await writeAuditLog({
        eventType: AuditEventType.LicenseExpired,
        actorType: 'system',
        actorId: null,
        targetType: 'License',
        targetId: c.id,
        metadata: { reason: 'expiresAt-elapsed', source: 'cron' },
        ip: null,
      });
    }
  }
  console.log(
    JSON.stringify({
      event: 'expire.done',
      now: now.toISOString(),
      candidates: candidates.length,
      flipped,
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
