import { describe, it, expect, vi } from 'vitest';
import { prisma } from '@/lib/prisma';
import { authenticateApiKey } from '@/lib/auth/api-key-middleware';
import { updateCustomer } from '@/lib/services/customer-service';
import { seedProduct, seedCustomer, seedLicense, seedApiKey, testCtx } from './helpers';

// getPortalSession reads the cookie via next/headers — drive it from a mutable
// holder so each test can present its own session token.
let currentCookie: string | undefined;
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (_name: string) => (currentCookie ? { value: currentCookie } : undefined),
  }),
}));

describe('authenticateApiKey — DB-backed checks (#7)', () => {
  it('authenticates a valid key and returns its scopes + license binding', async () => {
    const product = await seedProduct();
    const customer = await seedCustomer();
    const license = await seedLicense({
      customerId: customer.id,
      productId: product.id,
      bindingPolicy: { maxPerType: { account: 1 } },
    });
    const plaintext = await seedApiKey(['licenses:read', 'activations:read'], license.id);

    const ctx = await authenticateApiKey(plaintext);
    expect(ctx).not.toBeNull();
    expect(ctx?.scopes).toEqual(expect.arrayContaining(['licenses:read', 'activations:read']));
    expect(ctx?.licenseId).toBe(license.id);
  });

  it('rejects a revoked key', async () => {
    const plaintext = await seedApiKey(['licenses:read']);
    const ctx = await authenticateApiKey(plaintext);
    expect(ctx).not.toBeNull();
    await prisma.apiKey.update({ where: { id: ctx!.apiKeyId }, data: { revokedAt: new Date() } });
    expect(await authenticateApiKey(plaintext)).toBeNull();
  });

  it('rejects a missing / malformed key', async () => {
    expect(await authenticateApiKey(null)).toBeNull();
    expect(await authenticateApiKey('not-a-valid-key')).toBeNull();
  });

  it('drops unknown scope strings stored in the row (parseScopes)', async () => {
    const plaintext = await seedApiKey(['licenses:read']);
    const ctx = await authenticateApiKey(plaintext);
    // Inject a bogus scope alongside a valid one directly into the DB.
    await prisma.apiKey.update({
      where: { id: ctx!.apiKeyId },
      data: { scopes: ['licenses:read', 'totally:bogus', 42] as unknown as string[] },
    });
    const reAuthed = await authenticateApiKey(plaintext);
    expect(reAuthed?.scopes).toEqual(['licenses:read']);
  });
});

describe('getPortalSession — server-side state anchor (#7)', () => {
  it('accepts a session newer than portalSessionsValidAfter', async () => {
    const { signPortalSession, getPortalSession } = await import('@/lib/portal/session');
    const customer = await seedCustomer('portal@test.local', 'Portal');
    const { token } = await signPortalSession({ customerId: customer.id, email: customer.email });
    currentCookie = token;
    const session = await getPortalSession();
    expect(session?.customerId).toBe(customer.id);
  });

  it('rejects a session issued before portalSessionsValidAfter (post-reset invalidation)', async () => {
    const { signPortalSession, getPortalSession } = await import('@/lib/portal/session');
    const customer = await seedCustomer('portal2@test.local', 'Portal2');
    const { token } = await signPortalSession({ customerId: customer.id, email: customer.email });
    currentCookie = token;
    // Credential change AFTER the token was issued → all older sessions invalid.
    await prisma.customer.update({
      where: { id: customer.id },
      data: { portalSessionsValidAfter: new Date(Date.now() + 10_000) },
    });
    expect(await getPortalSession()).toBeNull();
  });

  it('rejects a session whose customer no longer exists', async () => {
    const { signPortalSession, getPortalSession } = await import('@/lib/portal/session');
    const customer = await seedCustomer('portal3@test.local', 'Portal3');
    const { token } = await signPortalSession({ customerId: customer.id, email: customer.email });
    currentCookie = token;
    await prisma.customer.delete({ where: { id: customer.id } });
    expect(await getPortalSession()).toBeNull();
  });
});

describe('updateCustomer — email change hygiene (N3)', () => {
  it('clears emailVerifiedAt and bumps portalSessionsValidAfter on an email change', async () => {
    const customer = await seedCustomer('old@test.local', 'C');
    await prisma.customer.update({
      where: { id: customer.id },
      data: { emailVerifiedAt: new Date(Date.now() - 60_000), portalSessionsValidAfter: null },
    });

    await updateCustomer(customer.id, { email: 'new@test.local' }, testCtx);

    const after = await prisma.customer.findUniqueOrThrow({ where: { id: customer.id } });
    expect(after.email).toBe('new@test.local');
    expect(after.emailVerifiedAt).toBeNull();
    expect(after.portalSessionsValidAfter).not.toBeNull();
  });

  it('does NOT touch verification/session state when the email is unchanged', async () => {
    const customer = await seedCustomer('stable@test.local', 'C');
    const verifiedAt = new Date(Date.now() - 60_000);
    await prisma.customer.update({
      where: { id: customer.id },
      data: { emailVerifiedAt: verifiedAt, portalSessionsValidAfter: null },
    });

    // Same email, different name.
    await updateCustomer(customer.id, { email: 'stable@test.local', name: 'C2' }, testCtx);

    const after = await prisma.customer.findUniqueOrThrow({ where: { id: customer.id } });
    expect(after.emailVerifiedAt?.getTime()).toBe(verifiedAt.getTime());
    expect(after.portalSessionsValidAfter).toBeNull();
  });
});
