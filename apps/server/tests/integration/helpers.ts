import { prisma } from '@/lib/prisma';
import type { AdminAuthContext } from '@/lib/auth/admin-route-auth';
import { createProduct } from '@/lib/services/product-service';
import { createLicense } from '@/lib/services/license-service';
import { createApiKey } from '@/lib/services/api-key-service';
import type { ApiKeyScope } from '@/lib/auth/api-key-middleware';

/** A fake admin-session context for seeding via the real service layer. */
export const testCtx: AdminAuthContext = {
  ip: null,
  subject: { kind: 'admin', userId: 'test-admin', email: 'admin@test.local', role: 'owner' },
};

export async function seedProduct(slug = 'fahrdienst', featureCatalog: string[] = []) {
  return createProduct(
    { slug, name: slug, featureCatalog, revocationStrategy: 'recheck', recheckIntervalHours: 12, jwtLifetimeHours: 48, licenseKeyPrefix: 'TROP' },
    testCtx,
  );
}

export async function seedCustomer(email = 'kunde@test.local', name = 'Test Kunde') {
  return prisma.customer.create({ data: { email, name } });
}

interface SeedLicenseInput {
  customerId: string;
  productId: string;
  bindingPolicy: unknown;
  featureFlags?: string[];
}

export async function seedLicense(input: SeedLicenseInput) {
  const { license } = await createLicense(
    {
      customerId: input.customerId,
      productId: input.productId,
      type: 'subscription',
      featureFlags: input.featureFlags ?? [],
      bindingPolicy: input.bindingPolicy as never,
      externalSource: 'manual',
    },
    testCtx,
  );
  return license;
}

export async function seedApiKey(scopes: ApiKeyScope[], licenseId?: string) {
  const { plaintext } = await createApiKey({ name: 'test-key', scopes, licenseId }, testCtx);
  return plaintext;
}

/** Convenience: full product+customer+license chain with a binding policy. */
export async function seedLicenseChain(bindingPolicy: unknown, featureFlags: string[] = []) {
  const product = await seedProduct('fahrdienst', featureFlags);
  const customer = await seedCustomer();
  const license = await seedLicense({
    customerId: customer.id,
    productId: product.id,
    bindingPolicy,
    featureFlags,
  });
  return { product, customer, license };
}

interface Binding {
  type: string;
  value: string;
  metadata?: Record<string, unknown>;
}

/**
 * Calls the real POST /api/v1/activate handler. Each call may pass a distinct
 * `ip` so the per-IP rate-limit bucket (10/min) doesn't bleed across tests.
 */
export async function callActivate(
  body: { licenseKey: string; productSlug: string; bindings: Binding[] },
  ip = '203.0.113.1',
) {
  const { POST } = await import('@/app/api/v1/activate/route');
  const req = new Request('http://localhost/api/v1/activate', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify(body),
  });
  const res = await POST(req);
  const json = (await res.json()) as Record<string, unknown>;
  return { status: res.status, json };
}

/** Counts activation.rejected audit rows, optionally for one license. */
export function countRejected(licenseId?: string): Promise<number> {
  return prisma.auditLog.count({
    where: { eventType: 'activation.rejected', ...(licenseId ? { targetId: licenseId } : {}) },
  });
}
