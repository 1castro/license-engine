import { describe, it, expect } from 'vitest';
import { ActivationStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { hashBindingValue } from '@/lib/binding/binding-hash';
import { seedLicenseChain, callActivate, countRejected } from './helpers';

const account = (value: string, name: string) => ({
  type: 'account',
  value,
  metadata: { displayName: name },
});

describe('POST /api/v1/activate — seat limit + rejection audit', () => {
  it('grants up to maxPerType, then rejects the overflow with 409 + audit', async () => {
    const { license } = await seedLicenseChain({
      required: ['account'],
      maxPerType: { account: 2 },
    });

    const a = await callActivate(
      { licenseKey: license.licenseKey, productSlug: 'fahrdienst', bindings: [account('u-a', 'A')] },
      '203.0.113.10',
    );
    expect(a.status).toBe(200);

    const b = await callActivate(
      { licenseKey: license.licenseKey, productSlug: 'fahrdienst', bindings: [account('u-b', 'B')] },
      '203.0.113.10',
    );
    expect(b.status).toBe(200);
    expect(b.json.seats).toContainEqual({ type: 'account', used: 2, max: 2 });

    // Third distinct account exceeds the limit.
    const c = await callActivate(
      { licenseKey: license.licenseKey, productSlug: 'fahrdienst', bindings: [account('u-c', 'C')] },
      '203.0.113.10',
    );
    expect(c.status).toBe(409);
    expect((c.json.error as { code: string }).code).toBe('binding_max_exceeded');

    // Exactly one rejection was audited for this license, with the right reason.
    expect(await countRejected(license.id)).toBe(1);
    const rej = await prisma.auditLog.findFirst({
      where: { eventType: 'activation.rejected', targetId: license.id },
    });
    expect((rej?.metadata as { reason: string }).reason).toBe('limit_erreicht');
    expect((rej?.metadata as { bindingType: string }).bindingType).toBe('account');
  });

  it('re-counts a released slot against the quota on re-activation (anti-churn)', async () => {
    const { license } = await seedLicenseChain({
      required: ['account'],
      maxPerType: { account: 2 },
    });
    const ok = (ip: string, v: string, n: string) =>
      callActivate(
        { licenseKey: license.licenseKey, productSlug: 'fahrdienst', bindings: [account(v, n)] },
        ip,
      );

    await ok('203.0.113.20', 'u-a', 'A');
    await ok('203.0.113.20', 'u-b', 'B');

    // Release A directly, then fill the slot with C → 2/2 (B, C).
    await prisma.activation.updateMany({
      where: { licenseId: license.id, bindingValueHash: hashBindingValue('account', 'u-a') },
      data: { status: ActivationStatus.released, releasedAt: new Date() },
    });
    const c = await ok('203.0.113.20', 'u-c', 'C');
    expect(c.status).toBe(200);

    // Re-activating the released A must now be refused — the quota is full.
    const reA = await ok('203.0.113.20', 'u-a', 'A');
    expect(reA.status).toBe(409);
    expect((reA.json.error as { code: string }).code).toBe('binding_max_exceeded');
  });

  it('re-seeing an already-active binding is idempotent (no false rejection)', async () => {
    const { license } = await seedLicenseChain({ maxPerType: { account: 1 } });
    const first = await callActivate(
      { licenseKey: license.licenseKey, productSlug: 'fahrdienst', bindings: [account('u-a', 'A')] },
      '203.0.113.30',
    );
    expect(first.status).toBe(200);
    const again = await callActivate(
      { licenseKey: license.licenseKey, productSlug: 'fahrdienst', bindings: [account('u-a', 'A')] },
      '203.0.113.30',
    );
    expect(again.status).toBe(200);
    expect(await countRejected(license.id)).toBe(0);
    expect(
      await prisma.activation.count({
        where: { licenseId: license.id, status: ActivationStatus.active },
      }),
    ).toBe(1);
  });
});

describe('POST /api/v1/activate — rejection reasons', () => {
  it('audits a missing required binding (pflichtbindung_fehlt, 400)', async () => {
    const { license } = await seedLicenseChain({
      required: ['account', 'domain'],
      maxPerType: { domain: 1, account: 5 },
    });
    // Only account, no domain → required violation.
    const res = await callActivate(
      { licenseKey: license.licenseKey, productSlug: 'fahrdienst', bindings: [account('u-a', 'A')] },
      '203.0.113.40',
    );
    expect(res.status).toBe(400);
    expect((res.json.error as { code: string }).code).toBe('binding_missing_required');
    const rej = await prisma.auditLog.findFirst({
      where: { eventType: 'activation.rejected', targetId: license.id },
    });
    expect((rej?.metadata as { reason: string }).reason).toBe('pflichtbindung_fehlt');
  });

  it('audits an invalid license key (key_ungültig, 400) with no license id', async () => {
    await seedLicenseChain({ maxPerType: { account: 1 } });
    const res = await callActivate(
      { licenseKey: 'TROP-XXXX-XXXX-XXXX-XXXX', productSlug: 'fahrdienst', bindings: [] },
      '203.0.113.50',
    );
    expect(res.status).toBe(400);
    expect((res.json.error as { code: string }).code).toBe('invalid_license_key');
    const rej = await prisma.auditLog.findFirst({ where: { eventType: 'activation.rejected' } });
    expect((rej?.metadata as { reason: string }).reason).toBe('key_ungültig');
    expect(rej?.targetId).toBeNull();
  });

  it('does NOT audit a successful activation or malformed transport errors', async () => {
    const { license } = await seedLicenseChain({ maxPerType: { account: 2 } });
    const ok = await callActivate(
      { licenseKey: license.licenseKey, productSlug: 'fahrdienst', bindings: [account('u-a', 'A')] },
      '203.0.113.60',
    );
    expect(ok.status).toBe(200);

    // Malformed JSON body → transport error, must not create a rejection event.
    const { POST } = await import('@/app/api/v1/activate/route');
    const bad = await POST(
      new Request('http://localhost/api/v1/activate', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.61' },
        body: '{ not json',
      }),
    );
    expect(bad.status).toBe(400);

    expect(await countRejected()).toBe(0);
  });
});
