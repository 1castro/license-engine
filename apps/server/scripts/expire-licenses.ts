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
import { LicenseStatus } from '@prisma/client';
import { prisma } from '../src/lib/prisma';
import { expireLicense } from '../src/lib/services/license-service';

async function main() {
  const now = new Date();
  const candidates = await prisma.license.findMany({
    where: { status: LicenseStatus.active, expiresAt: { not: null, lte: now } },
    select: { id: true },
  });

  if (candidates.length === 0) {
    console.log(JSON.stringify({ event: 'expire.no_candidates', now: now.toISOString() }));
    return;
  }

  // expireLicense flips status AND releases seats in one transaction (idempotent).
  let flipped = 0;
  for (const c of candidates) {
    if (await expireLicense(c.id, 'cron', null)) flipped += 1;
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
