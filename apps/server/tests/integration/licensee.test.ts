import { describe, it, expect } from 'vitest';
import { prisma } from '@/lib/prisma';
import { seedLicenseChain, callActivate, callRecheck } from './helpers';

const account = (value: string) => ({ type: 'account', value, metadata: { displayName: value } });

/** Reads the (unverified) JWT payload — enough to assert which claims are present. */
function decodeClaims(token: string): Record<string, unknown> {
  const payload = token.split('.')[1]!;
  return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
}

describe('activate/recheck — licensee + plan (display-only)', () => {
  it('echoes the customer name as licensee in the response AND the token claim', async () => {
    const { license } = await seedLicenseChain({ maxPerType: { account: 2 } });
    const res = await callActivate(
      { licenseKey: license.licenseKey, productSlug: 'fahrdienst', bindings: [account('u-a')] },
      '203.0.113.200',
    );
    expect(res.status).toBe(200);
    // seedCustomer has no company → licensee falls back to the name.
    expect(res.json.licensee).toBe('Test Kunde');
    const claims = decodeClaims(res.json.token as string);
    expect(claims.licensee).toBe('Test Kunde');
    // No planName on the license → plan absent in both response and token.
    expect('plan' in res.json).toBe(false);
    expect('plan' in claims).toBe(false);
    // Seeded license has no expiresAt → perpetual, no licenseExpiresAt.
    expect(res.json.perpetual).toBe(true);
    expect('licenseExpiresAt' in res.json).toBe(false);
    expect(claims.perpetual).toBe(true);
    // Token still carries its own exp (the offline-grace boundary), separate
    // from the (absent) real license end.
    expect(typeof claims.exp).toBe('number');
  });

  it('prefers company over name for licensee', async () => {
    const { license, customer } = await seedLicenseChain({ maxPerType: { account: 2 } });
    await prisma.customer.update({ where: { id: customer.id }, data: { company: 'FidiBus GmbH' } });
    const res = await callActivate(
      { licenseKey: license.licenseKey, productSlug: 'fahrdienst', bindings: [account('u-a')] },
      '203.0.113.201',
    );
    expect(res.json.licensee).toBe('FidiBus GmbH');
    expect(decodeClaims(res.json.token as string).licensee).toBe('FidiBus GmbH');
  });

  it('includes plan when the license carries a planName', async () => {
    const { license } = await seedLicenseChain({ maxPerType: { account: 2 } });
    await prisma.license.update({ where: { id: license.id }, data: { planName: 'Pro' } });
    const res = await callActivate(
      { licenseKey: license.licenseKey, productSlug: 'fahrdienst', bindings: [account('u-a')] },
      '203.0.113.202',
    );
    expect(res.json.plan).toBe('Pro');
    expect(decodeClaims(res.json.token as string).plan).toBe('Pro');
  });

  it('reports the REAL license end as licenseExpiresAt when the license is dated', async () => {
    const { license } = await seedLicenseChain({ maxPerType: { account: 2 } });
    const end = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000); // 90 days out
    await prisma.license.update({ where: { id: license.id }, data: { expiresAt: end } });
    const res = await callActivate(
      { licenseKey: license.licenseKey, productSlug: 'fahrdienst', bindings: [account('u-a')] },
      '203.0.113.204',
    );
    expect(res.json.licenseExpiresAt).toBe(end.toISOString());
    expect('perpetual' in res.json).toBe(false);
    const claims = decodeClaims(res.json.token as string);
    expect(claims.licenseExpiresAt).toBe(end.toISOString());
    expect('perpetual' in claims).toBe(false);
    // The token's own exp is the 7d grace boundary, NOT the 90d license end.
    const tokenExpMs = (claims.exp as number) * 1000;
    expect(tokenExpMs).toBeLessThan(end.getTime());
  });

  it('carries licensee through recheck as well', async () => {
    const { license, customer } = await seedLicenseChain({ maxPerType: { account: 2 } });
    await prisma.customer.update({ where: { id: customer.id }, data: { company: 'Berlin Shuttle' } });
    const act = await callActivate(
      { licenseKey: license.licenseKey, productSlug: 'fahrdienst', bindings: [account('u-a')] },
      '203.0.113.203',
    );
    const token = act.json.token as string;
    const res = await callRecheck({ token, productSlug: 'fahrdienst' }, '203.0.113.203');
    expect(res.json.status).toBe('active');
    expect(res.json.licensee).toBe('Berlin Shuttle');
    expect(decodeClaims(res.json.token as string).licensee).toBe('Berlin Shuttle');
  });
});
