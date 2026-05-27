/**
 * Phase-3 verification helper:
 *  - Backfills a signing key for any product that doesn't have one yet
 *    (covers products created before the auto-provisioning hook landed).
 *  - Prints the IDs we need for the end-to-end activate/recheck/deactivate
 *    curl walkthrough.
 *
 * Usage:  pnpm tsx scripts/phase3-bootstrap.ts
 */
import { PrismaClient } from '@prisma/client';
import { generateAndStoreSigningKey } from '../src/lib/signing/signing-key-service';

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const products = await prisma.product.findMany();
    for (const p of products) {
      if (!p.activeSigningKeyId) {
        console.log(`Backfilling signing key for product ${p.slug} (${p.id}) …`);
        await generateAndStoreSigningKey({ id: p.id, slug: p.slug }, null);
      }
    }

    const licenses = await prisma.license.findMany({
      where: { status: 'active' },
      include: { product: { select: { slug: true } } },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });
    console.log('\nActive licenses for E2E test:');
    for (const l of licenses) {
      console.log(`  licenseKey=${l.licenseKey}  productSlug=${l.product.slug}  id=${l.id}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
