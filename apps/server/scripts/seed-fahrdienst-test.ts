/**
 * One-off seed: setzt das `fahrdienst`-Produkt-Timing (recheck 24h / exp 168h)
 * und legt den Test-Kunden + die Test-Lizenz für die Fahrdienst-Integration auf
 * `tester.fahrdienst.pro` an. Geht über die Service-Funktionen (korrekter
 * licenseKey + Audit-Log). Idempotent: dedupliziert über `externalRef`, ein
 * erneuter Lauf liefert denselben licenseKey und ändert nichts doppelt.
 *
 * Lauf in Produktion (über das migrate/builder-Image, kein App-Recreate):
 *   cd /opt/stacks/license-engine
 *   docker compose run --rm \
 *     -v /tmp/seed-fahrdienst-test.ts:/app/apps/server/scripts/seed-fahrdienst-test.ts \
 *     license-engine-migrate \
 *     pnpm --filter @license-engine/server exec tsx scripts/seed-fahrdienst-test.ts
 *
 * Rollback: die Test-Lizenz/-Kunden im Admin-UI widerrufen/löschen (oder per
 * externalRef 'fahrdienst-test' / 'fahrdienst-test-tester' identifizieren).
 */
import { BindingType } from '@prisma/client';
import { prisma } from '../src/lib/prisma';
import { updateProduct } from '../src/lib/services/product-service';
import { createCustomer } from '../src/lib/services/customer-service';
import { createLicense } from '../src/lib/services/license-service';
import type { AdminAuthContext } from '../src/lib/auth/admin-route-auth';

const ctx: AdminAuthContext = {
  ip: null,
  subject: {
    kind: 'admin',
    userId: 'seed:fahrdienst-test',
    email: 'seed@license-engine.local',
    role: 'owner',
  },
};

async function main(): Promise<void> {
  // 1) Produkt-Timing setzen: recheck 1h (Pause/Widerruf greift online ≤1h),
  //    exp/Grace 168h (7 Tage, Offline-Toleranz unverändert).
  const product = await prisma.product.findUnique({ where: { slug: 'fahrdienst' } });
  if (!product) {
    throw new Error("Produkt 'fahrdienst' nicht gefunden — bitte zuerst anlegen.");
  }
  await updateProduct(product.id, { recheckIntervalHours: 1, jwtLifetimeHours: 168 }, ctx);

  // 2) Test-Kunde (idempotent über externalRef).
  const { customer, created: custCreated } = await createCustomer(
    {
      email: 'tester@fahrdienst.pro',
      name: 'Fahrdienst Tester',
      externalRef: 'fahrdienst-test',
      externalSource: 'manual',
    },
    ctx,
  );

  // 3) Test-Lizenz (idempotent über externalRef): domain Pflicht (max 1) +
  //    account max 2 (zum Testen des 409 binding_max_exceeded).
  const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
  const { license, created: licCreated } = await createLicense(
    {
      customerId: customer.id,
      productId: product.id,
      type: 'subscription',
      expiresAt,
      featureFlags: [],
      bindingPolicy: {
        required: [BindingType.domain],
        maxPerType: { [BindingType.domain]: 1, [BindingType.account]: 2 },
      },
      externalRef: 'fahrdienst-test-tester',
      externalSource: 'manual',
    },
    ctx,
  );

  const p = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });

  console.log('\n===== SEED ERGEBNIS (fahrdienst-test) =====');
  console.log(
    JSON.stringify(
      {
        product: {
          slug: p.slug,
          recheckIntervalHours: p.recheckIntervalHours,
          jwtLifetimeHours: p.jwtLifetimeHours,
        },
        customer: { id: customer.id, email: customer.email, created: custCreated },
        license: {
          id: license.id,
          licenseKey: license.licenseKey,
          status: license.status,
          expiresAt: license.expiresAt,
          bindingPolicy: license.bindingPolicy,
          created: licCreated,
        },
      },
      null,
      2,
    ),
  );
  console.log('===========================================\n');
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
