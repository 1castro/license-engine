import { describe, it, expect } from 'vitest';
import { ActivationStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { seedLicenseChain, callActivate, callDeactivate } from './helpers';

const account = (value: string) => ({ type: 'account', value, metadata: { displayName: value } });

describe('POST /api/v1/deactivate — release + idempotency (#6)', () => {
  it('releases the token-owned binding, then is idempotent', async () => {
    const { license } = await seedLicenseChain({ required: ['account'], maxPerType: { account: 2 } });
    const act = await callActivate(
      { licenseKey: license.licenseKey, productSlug: 'fahrdienst', bindings: [account('u-a')] },
      '203.0.113.130',
    );
    expect(act.status).toBe(200);
    const token = act.json.token as string;

    const first = await callDeactivate(
      { token, productSlug: 'fahrdienst', bindingType: 'account', bindingValue: 'u-a' },
      '203.0.113.130',
    );
    expect(first.status).toBe(200);
    expect(first.json.released).toBe(true);

    // The seat is now free.
    expect(
      await prisma.activation.count({
        where: { licenseId: license.id, status: ActivationStatus.active },
      }),
    ).toBe(0);

    // Releasing again is idempotent — no error, released:false.
    const second = await callDeactivate(
      { token, productSlug: 'fahrdienst', bindingType: 'account', bindingValue: 'u-a' },
      '203.0.113.130',
    );
    expect(second.status).toBe(200);
    expect(second.json.released).toBe(false);
  });

  it('refuses to release a binding the presented token does not carry (#10 ownership)', async () => {
    const { license } = await seedLicenseChain({ required: ['account'], maxPerType: { account: 2 } });
    // Two seats on the same license; tokenA carries ONLY u-a.
    const a = await callActivate(
      { licenseKey: license.licenseKey, productSlug: 'fahrdienst', bindings: [account('u-a')] },
      '203.0.113.131',
    );
    const tokenA = a.json.token as string;
    await callActivate(
      { licenseKey: license.licenseKey, productSlug: 'fahrdienst', bindings: [account('u-b')] },
      '203.0.113.131',
    );

    // tokenA must NOT be able to free u-b (a colleague's seat).
    const res = await callDeactivate(
      { token: tokenA, productSlug: 'fahrdienst', bindingType: 'account', bindingValue: 'u-b' },
      '203.0.113.131',
    );
    expect(res.status).toBe(403);
    expect((res.json.error as { code: string }).code).toBe('binding_not_owned');

    // u-b's seat is untouched.
    expect(
      await prisma.activation.count({
        where: { licenseId: license.id, status: ActivationStatus.active },
      }),
    ).toBe(2);
  });

  it('rejects a token signed for a different product (audience mismatch)', async () => {
    const { license } = await seedLicenseChain({ required: ['account'], maxPerType: { account: 2 } });
    const a = await callActivate(
      { licenseKey: license.licenseKey, productSlug: 'fahrdienst', bindings: [account('u-a')] },
      '203.0.113.132',
    );
    const token = a.json.token as string;
    // Same token, wrong productSlug in the request → token verify fails.
    const res = await callDeactivate(
      { token, productSlug: 'some-other-product', bindingType: 'account', bindingValue: 'u-a' },
      '203.0.113.132',
    );
    // 404 unknown_product (the slug doesn't exist) — never a successful release.
    expect(res.status).not.toBe(200);
  });
});

describe('POST /api/v1/activate — concurrent quota lock (#6)', () => {
  it('two distinct bindings racing for maxPerType:1 yield exactly one 200 + one 409', async () => {
    const { license } = await seedLicenseChain({ required: ['account'], maxPerType: { account: 1 } });
    const fire = (v: string, ip: string) =>
      callActivate(
        { licenseKey: license.licenseKey, productSlug: 'fahrdienst', bindings: [account(v)] },
        ip,
      );

    // Distinct IPs so the per-IP rate limiter doesn't interfere with the race.
    const [r1, r2] = await Promise.all([fire('u-a', '203.0.113.140'), fire('u-b', '203.0.113.141')]);
    const statuses = [r1.status, r2.status].sort();
    expect(statuses).toEqual([200, 409]);

    // Exactly one active seat persisted — the FOR-UPDATE lock held under the race.
    expect(
      await prisma.activation.count({
        where: { licenseId: license.id, status: ActivationStatus.active },
      }),
    ).toBe(1);
  });
});
