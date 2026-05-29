import { describe, it, expect, vi, beforeEach } from 'vitest';

// authorizeAdminRoute tries a NextAuth session first, which calls next/headers()
// — unavailable outside a real request scope. Mock getServerSession so we can
// drive both auth paths: default "no session" (→ API-key branch), or an injected
// admin session for the admin-bypass test.
const { getServerSessionMock } = vi.hoisted(() => ({ getServerSessionMock: vi.fn() }));
vi.mock('next-auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next-auth')>()),
  getServerSession: getServerSessionMock,
}));
beforeEach(() => getServerSessionMock.mockResolvedValue(null));

import { seedProduct, seedCustomer, seedLicense, seedApiKey } from './helpers';

function adminReq(url: string, key: string, method = 'GET', body?: unknown) {
  return new Request(url, {
    method,
    headers: {
      authorization: `Bearer ${key}`,
      'content-type': 'application/json',
      'x-forwarded-for': '203.0.113.200',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function twoLicenses() {
  const product = await seedProduct('fahrdienst');
  const custA = await seedCustomer('a@test.local', 'Kunde A');
  const custB = await seedCustomer('b@test.local', 'Kunde B');
  const licA = await seedLicense({
    customerId: custA.id,
    productId: product.id,
    bindingPolicy: { maxPerType: { account: 5 } },
  });
  const licB = await seedLicense({
    customerId: custB.id,
    productId: product.id,
    bindingPolicy: { maxPerType: { account: 5 } },
  });
  return { licA, licB };
}

describe('Multi-tenant isolation — license-bound API keys', () => {
  it('lets a bound key read its OWN license activations (200)', async () => {
    const { licA } = await twoLicenses();
    const key = await seedApiKey(['activations:read'], licA.id);
    const { GET } = await import('@/app/api/admin/v1/licenses/[id]/activations/route');
    const res = await GET(
      adminReq(`http://localhost/api/admin/v1/licenses/${licA.id}/activations`, key),
      { params: Promise.resolve({ id: licA.id }) },
    );
    expect(res.status).toBe(200);
  });

  it('returns 404 when a bound key requests a FOREIGN license (no existence leak)', async () => {
    const { licA, licB } = await twoLicenses();
    const key = await seedApiKey(['activations:read'], licA.id);
    const { GET } = await import('@/app/api/admin/v1/licenses/[id]/activations/route');
    const res = await GET(
      adminReq(`http://localhost/api/admin/v1/licenses/${licB.id}/activations`, key),
      { params: Promise.resolve({ id: licB.id }) },
    );
    expect(res.status).toBe(404);
  });

  it('lets an UNBOUND key read any license (200)', async () => {
    const { licB } = await twoLicenses();
    const key = await seedApiKey(['activations:read']); // no licenseId
    const { GET } = await import('@/app/api/admin/v1/licenses/[id]/activations/route');
    const res = await GET(
      adminReq(`http://localhost/api/admin/v1/licenses/${licB.id}/activations`, key),
      { params: Promise.resolve({ id: licB.id }) },
    );
    expect(res.status).toBe(200);
  });

  it('refuses scopes that are not bindable when a licenseId is set (400)', async () => {
    const { licA } = await twoLicenses();
    // licenses:write is NOT in LICENSE_BOUND_ALLOWED_SCOPES → must be rejected.
    await expect(seedApiKey(['licenses:write'], licA.id)).rejects.toThrow();
  });

  it('lets an admin SESSION read any license (no binding restriction)', async () => {
    const { licB } = await twoLicenses();
    getServerSessionMock.mockResolvedValue({
      user: { id: 'admin-1', email: 'admin@test.local', role: 'owner' },
    });
    const { GET } = await import('@/app/api/admin/v1/licenses/[id]/activations/route');
    // No API key header — auth comes from the (mocked) admin session.
    const req = new Request(`http://localhost/api/admin/v1/licenses/${licB.id}/activations`, {
      headers: { 'x-forwarded-for': '203.0.113.201' },
    });
    const res = await GET(req, { params: Promise.resolve({ id: licB.id }) });
    expect(res.status).toBe(200);
  });
});

describe('API-key management is admin-session only (no privilege escalation)', () => {
  it('rejects an API-key actor from creating new keys (403)', async () => {
    const product = await seedProduct('fahrdienst');
    const cust = await seedCustomer();
    const lic = await seedLicense({
      customerId: cust.id,
      productId: product.id,
      bindingPolicy: { maxPerType: { account: 5 } },
    });
    // An unbound key with broad scopes still must not manage api-keys.
    const key = await seedApiKey(['products:write', 'licenses:write']);
    const { POST } = await import('@/app/api/admin/v1/api-keys/route');
    const res = await POST(
      adminReq('http://localhost/api/admin/v1/api-keys', key, 'POST', {
        name: 'escalated',
        scopes: ['licenses:revoke'],
        licenseId: lic.id,
      }),
    );
    expect(res.status).toBe(403);
  });
});
