import { describe, it, expect } from 'vitest';
import { ActivationStatus, LicenseStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { updateLicense, revokeLicense } from '@/lib/services/license-service';
import { seedLicenseChain, callActivate, callRecheck, testCtx } from './helpers';

const account = (value: string, name: string) => ({
  type: 'account',
  value,
  metadata: { displayName: name },
});

async function activeToken(ip: string, value = 'u-a') {
  const { license } = await seedLicenseChain({ required: ['account'], maxPerType: { account: 2 } });
  const act = await callActivate(
    { licenseKey: license.licenseKey, productSlug: 'fahrdienst', bindings: [account(value, value)] },
    ip,
  );
  expect(act.status).toBe(200);
  return { license, token: act.json.token as string };
}

describe('POST /api/v1/recheck — lifecycle signals (#5)', () => {
  it('returns active + seats for a still-valid token', async () => {
    const { token } = await activeToken('203.0.113.110');
    const res = await callRecheck({ token, productSlug: 'fahrdienst' }, '203.0.113.110');
    expect(res.status).toBe(200);
    expect(res.json.status).toBe('active');
    expect(res.json.seats).toContainEqual({ type: 'account', used: 1, max: 2 });
    expect(typeof res.json.token).toBe('string');
  });

  it('signals revoked for a revoked license', async () => {
    const { license, token } = await activeToken('203.0.113.111');
    await revokeLicense(license.id, 'test', testCtx);
    const res = await callRecheck({ token, productSlug: 'fahrdienst' }, '203.0.113.111');
    expect(res.status).toBe(200);
    expect(res.json.status).toBe('revoked');
  });

  it('signals expired for an already-expired license', async () => {
    const { license, token } = await activeToken('203.0.113.112');
    await prisma.license.update({
      where: { id: license.id },
      data: { status: LicenseStatus.expired },
    });
    const res = await callRecheck({ token, productSlug: 'fahrdienst' }, '203.0.113.112');
    expect(res.status).toBe(200);
    expect(res.json.status).toBe('expired');
  });

  it('lazy-expires a time-elapsed license AND releases its seats (N1)', async () => {
    const { license, token } = await activeToken('203.0.113.113');
    // Seat is occupied before expiry.
    expect(
      await prisma.activation.count({
        where: { licenseId: license.id, status: ActivationStatus.active },
      }),
    ).toBe(1);

    // Time elapses past expiresAt while status is still active.
    await prisma.license.update({
      where: { id: license.id },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });
    const res = await callRecheck({ token, productSlug: 'fahrdienst' }, '203.0.113.113');
    expect(res.status).toBe(200);
    expect(res.json.status).toBe('expired');

    // Status flipped to expired ...
    const after = await prisma.license.findUniqueOrThrow({ where: { id: license.id } });
    expect(after.status).toBe(LicenseStatus.expired);
    // ... and the seat was released (no active activations remain) — analog revoke.
    expect(
      await prisma.activation.count({
        where: { licenseId: license.id, status: ActivationStatus.active },
      }),
    ).toBe(0);
    // A LicenseExpired audit row was written by expireLicense.
    expect(
      await prisma.auditLog.count({
        where: { eventType: 'license.expired', targetId: license.id },
      }),
    ).toBe(1);
  });

  it('refuses to re-issue when every binding on the token was released (bindings_released)', async () => {
    const { license, token } = await activeToken('203.0.113.114');
    // Release the only binding (simulating a central seat-free / deactivate).
    await prisma.activation.updateMany({
      where: { licenseId: license.id },
      data: { status: ActivationStatus.released, releasedAt: new Date() },
    });
    const res = await callRecheck({ token, productSlug: 'fahrdienst' }, '203.0.113.114');
    expect(res.status).toBe(403);
    expect((res.json.error as { code: string }).code).toBe('bindings_released');
  });
});

describe('updateLicense + recheck — un-expire on renewal (Blocker #1)', () => {
  it('a renewal of an EXPIRED license flips it back to active and recheck succeeds', async () => {
    const { license, token } = await activeToken('203.0.113.120');
    // Drive it into expired (status + elapsed expiresAt), seats released.
    await prisma.license.update({
      where: { id: license.id },
      data: { status: LicenseStatus.expired, expiresAt: new Date(Date.now() - 60_000) },
    });

    // Admin/PSP renews with a future expiresAt.
    const renewed = await updateLicense(
      license.id,
      { expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() },
      testCtx,
    );
    expect(renewed.status).toBe(LicenseStatus.active);

    // The previously-locked-out customer can validate again. Their old token's
    // binding was released on expiry, so recheck demands re-activation rather
    // than silently re-issuing — but crucially it is NOT an expired/locked verdict.
    const res = await callRecheck({ token, productSlug: 'fahrdienst' }, '203.0.113.120');
    expect(res.json.status).not.toBe('expired');
    expect(res.json.status).not.toBe('revoked');

    // And a fresh activation now works against the un-expired license.
    const reAct = await callActivate(
      { licenseKey: license.licenseKey, productSlug: 'fahrdienst', bindings: [account('u-a', 'u-a')] },
      '203.0.113.120',
    );
    expect(reAct.status).toBe(200);
  });

  it('does NOT un-expire when the new expiresAt is still in the past', async () => {
    const { license } = await activeToken('203.0.113.121');
    await prisma.license.update({
      where: { id: license.id },
      data: { status: LicenseStatus.expired, expiresAt: new Date(Date.now() - 60_000) },
    });
    const updated = await updateLicense(
      license.id,
      { expiresAt: new Date(Date.now() - 30_000).toISOString() },
      testCtx,
    );
    expect(updated.status).toBe(LicenseStatus.expired);
  });

  it('does NOT resurrect a revoked license via updateLicense', async () => {
    const { license } = await activeToken('203.0.113.122');
    await revokeLicense(license.id, 'test', testCtx);
    const updated = await updateLicense(
      license.id,
      { expiresAt: new Date(Date.now() + 60_000).toISOString() },
      testCtx,
    );
    expect(updated.status).toBe(LicenseStatus.revoked);
  });
});
