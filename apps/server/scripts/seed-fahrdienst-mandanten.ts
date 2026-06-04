/**
 * One-off seed: legt die beiden produktiven Fahrdienst-Mandanten-Lizenzen an
 * (FidiBus + Berlin Shuttle) am Produkt `fahrdienst`. Über die Service-Funktionen
 * (korrekter licenseKey + Audit-Log). Idempotent: dedupliziert über `externalRef`
 * (Kunde UND Lizenz), Re-Run liefert dieselben licenseKeys, ändert nichts doppelt.
 *
 * licensee = company (B2B "Licensed to …"). Laufzeit: perpetual (unbefristet) →
 * App zeigt "unlimited". bindingPolicy: domain Pflicht (max 1), account unbegrenzt.
 * Domain wird NICHT hier gesetzt — die App bindet sie beim ersten activate.
 *
 * Lauf (Prod, über migrate/builder-Image, kein App-Recreate):
 *   cd /opt/stacks/license-engine
 *   docker compose run --rm \
 *     -v /tmp/seed-fahrdienst-mandanten.ts:/app/apps/server/scripts/seed-fahrdienst-mandanten.ts \
 *     license-engine-migrate \
 *     pnpm --filter @license-engine/server exec tsx scripts/seed-fahrdienst-mandanten.ts
 *
 * Rollback: Lizenzen/Kunden über externalRef bzw. im Admin-UI widerrufen/löschen.
 */
import { BindingType, LicenseType } from '@prisma/client';
import { prisma } from '../src/lib/prisma';
import { createCustomer } from '../src/lib/services/customer-service';
import { createLicense } from '../src/lib/services/license-service';
import type { AdminAuthContext } from '../src/lib/auth/admin-route-auth';

const ctx: AdminAuthContext = {
  ip: null,
  subject: {
    kind: 'admin',
    userId: 'seed:fahrdienst-mandanten',
    email: 'seed@license-engine.local',
    role: 'owner',
  },
};

const MANDANTEN = [
  { ref: 'fahrdienst-fidibus', licensee: 'FidiBus Fahrdienst UG & Co. KG', email: 'info@fidibus-bernau.de' },
  { ref: 'fahrdienst-shuttle', licensee: 'Berlin Shuttle Zahl GmbH', email: 'office@berlin-shuttle.de' },
];

async function main(): Promise<void> {
  const product = await prisma.product.findUnique({ where: { slug: 'fahrdienst' } });
  if (!product) {
    throw new Error("Produkt 'fahrdienst' nicht gefunden — bitte zuerst anlegen.");
  }

  const results: unknown[] = [];
  for (const m of MANDANTEN) {
    const { customer, created: custCreated } = await createCustomer(
      {
        email: m.email,
        name: m.licensee,
        company: m.licensee,
        externalRef: m.ref,
        externalSource: 'manual',
      },
      ctx,
    );

    const { license, created: licCreated } = await createLicense(
      {
        customerId: customer.id,
        productId: product.id,
        type: LicenseType.perpetual, // unbefristet → kein expiresAt
        featureFlags: [],
        bindingPolicy: {
          required: [BindingType.domain],
          maxPerType: { [BindingType.domain]: 1 }, // account weggelassen = unbegrenzt
        },
        externalRef: m.ref,
        externalSource: 'manual',
      },
      ctx,
    );

    results.push({
      licensee: m.licensee,
      customer: { id: customer.id, email: customer.email, created: custCreated },
      license: {
        id: license.id,
        licenseKey: license.licenseKey,
        status: license.status,
        type: license.type,
        perpetual: license.expiresAt === null,
        bindingPolicy: license.bindingPolicy,
        created: licCreated,
      },
    });
  }

  console.log('\n===== FAHRDIENST-MANDANTEN-LIZENZEN =====');
  console.log(JSON.stringify(results, null, 2));
  console.log('=========================================\n');
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
