import { describe, it, expect } from 'vitest';
import {
  createLicense,
  updateLicense,
  listLicenses,
} from '@/lib/services/license-service';
import { seedProduct, seedCustomer, testCtx } from './helpers';

async function baseInput() {
  const product = await seedProduct('fahrdienst');
  const customer = await seedCustomer();
  return {
    customerId: customer.id,
    productId: product.id,
    type: 'subscription' as const,
    featureFlags: [],
    bindingPolicy: {},
    externalSource: 'polar' as const,
  };
}

describe('Payment-Vorbereitung — externalRef-Lookup + Display-Metadaten', () => {
  it('stores display billing metadata and the polar source', async () => {
    const { license } = await createLicense(
      {
        ...(await baseInput()),
        externalRef: 'sub_123',
        planName: 'Pro',
        priceDisplay: '29 €/Monat',
        billingInterval: 'monthly',
      },
      testCtx,
    );
    expect(license.externalSource).toBe('polar');
    expect(license.planName).toBe('Pro');
    expect(license.priceDisplay).toBe('29 €/Monat');
    expect(license.billingInterval).toBe('monthly');
  });

  it('finds a license by (externalSource, externalRef) — the sync-module lookup', async () => {
    const input = await baseInput();
    const { license } = await createLicense({ ...input, externalRef: 'sub_456' }, testCtx);
    // A second customer/license with a different ref must not match.
    await createLicense({ ...input, externalRef: 'sub_999' }, testCtx);

    const found = await listLicenses({ externalSource: 'polar', externalRef: 'sub_456' });
    expect(found).toHaveLength(1);
    expect(found[0]?.id).toBe(license.id);
  });

  it('is idempotent: re-create with same (source, ref) returns the existing license', async () => {
    const input = await baseInput();
    const first = await createLicense({ ...input, externalRef: 'sub_dup' }, testCtx);
    expect(first.created).toBe(true);
    const second = await createLicense({ ...input, externalRef: 'sub_dup' }, testCtx);
    expect(second.created).toBe(false);
    expect(second.license.id).toBe(first.license.id);
  });

  it('renews via update (expiresAt) and clears a display field with null', async () => {
    const { license } = await createLicense(
      { ...(await baseInput()), externalRef: 'sub_renew', planName: 'Pro' },
      testCtx,
    );
    const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const renewed = await updateLicense(license.id, { expiresAt: future }, testCtx);
    expect(renewed.expiresAt?.toISOString()).toBe(future);
    expect(renewed.planName).toBe('Pro'); // untouched when not provided

    const cleared = await updateLicense(license.id, { planName: null }, testCtx);
    expect(cleared.planName).toBeNull();
  });
});
