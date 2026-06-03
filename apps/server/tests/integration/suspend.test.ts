import { describe, it, expect } from 'vitest';
import { ActivationStatus, LicenseStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import {
  suspendLicense,
  reactivateLicense,
  revokeLicense,
  LicenseStateTransitionError,
} from '@/lib/services/license-service';
import { seedLicenseChain, callActivate, callRecheck, testCtx } from './helpers';

const domain = { type: 'domain', value: 'tester.fahrdienst.pro', metadata: {} };
const account = (v: string) => ({ type: 'account', value: v, metadata: { displayName: v } });

async function seedActivated(ip: string) {
  const { license } = await seedLicenseChain({
    required: ['domain'],
    maxPerType: { domain: 1, account: 2 },
  });
  const act = await callActivate(
    { licenseKey: license.licenseKey, productSlug: 'fahrdienst', bindings: [domain, account('u-a')] },
    ip,
  );
  expect(act.status).toBe(200);
  return { license, token: act.json.token as string };
}

function activeSeats(licenseId: string) {
  return prisma.activation.count({ where: { licenseId, status: ActivationStatus.active } });
}

describe('Pause/Resume (suspend) — seats held, app blocked', () => {
  it('blocks activate (403 license_suspended) while paused, WITHOUT releasing seats', async () => {
    const { license } = await seedActivated('203.0.113.210');
    expect(await activeSeats(license.id)).toBe(2); // domain + account

    await suspendLicense(license.id, 'Zahlung klären', testCtx);

    // Seats are HELD (unlike revoke/expire which release).
    expect(await activeSeats(license.id)).toBe(2);
    const row = await prisma.license.findUniqueOrThrow({ where: { id: license.id } });
    expect(row.status).toBe(LicenseStatus.suspended);
    expect(row.suspendedAt).not.toBeNull();
    expect(row.suspendReason).toBe('Zahlung klären');

    // App access is blocked with a distinct code.
    const act = await callActivate(
      { licenseKey: license.licenseKey, productSlug: 'fahrdienst', bindings: [domain] },
      '203.0.113.210',
    );
    expect(act.status).toBe(403);
    expect((act.json.error as { code: string }).code).toBe('license_suspended');
  });

  it('recheck returns status "suspended" while paused', async () => {
    const { license, token } = await seedActivated('203.0.113.211');
    await suspendLicense(license.id, undefined, testCtx);
    const res = await callRecheck({ token, productSlug: 'fahrdienst' }, '203.0.113.211');
    expect(res.status).toBe(200);
    expect(res.json.status).toBe('suspended');
  });

  it('reactivate resumes seamlessly: recheck active again, held seats intact', async () => {
    const { license, token } = await seedActivated('203.0.113.212');
    await suspendLicense(license.id, undefined, testCtx);

    const updated = await reactivateLicense(license.id, testCtx);
    expect(updated.status).toBe(LicenseStatus.active);
    expect(updated.suspendedAt).toBeNull();
    expect(updated.suspendReason).toBeNull();

    // Seats were held throughout → still 2, no re-activation needed.
    expect(await activeSeats(license.id)).toBe(2);
    // The SAME token rechecks back to active (bindings still active).
    const res = await callRecheck({ token, productSlug: 'fahrdienst' }, '203.0.113.212');
    expect(res.json.status).toBe('active');
    expect(res.json.seats).toContainEqual({ type: 'account', used: 1, max: 2 });
  });

  it('writes suspend + reactivate audit events', async () => {
    const { license } = await seedActivated('203.0.113.213');
    await suspendLicense(license.id, undefined, testCtx);
    await reactivateLicense(license.id, testCtx);
    expect(
      await prisma.auditLog.count({ where: { eventType: 'license.suspended', targetId: license.id } }),
    ).toBe(1);
    expect(
      await prisma.auditLog.count({ where: { eventType: 'license.reactivated', targetId: license.id } }),
    ).toBe(1);
  });
});

describe('Pause/Resume — transition guards', () => {
  it('refuses to suspend a non-active license (e.g. revoked)', async () => {
    const { license } = await seedActivated('203.0.113.214');
    await revokeLicense(license.id, 'test', testCtx);
    await expect(suspendLicense(license.id, undefined, testCtx)).rejects.toBeInstanceOf(
      LicenseStateTransitionError,
    );
  });

  it('refuses to reactivate a license that is not suspended', async () => {
    const { license } = await seedActivated('203.0.113.215');
    await expect(reactivateLicense(license.id, testCtx)).rejects.toBeInstanceOf(
      LicenseStateTransitionError,
    );
  });
});
