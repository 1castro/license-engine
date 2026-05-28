import { describe, it, expect, beforeAll } from 'vitest';
import { NextResponse } from 'next/server';

beforeAll(() => {
  process.env.DATABASE_URL ??= 'postgresql://x:x@localhost:5432/x?schema=public';
  process.env.APP_BASE_URL ??= 'http://localhost:3000';
  process.env.JWT_ISSUER ??= 'license.test';
  process.env.NEXTAUTH_SECRET ??= 'test-secret-must-be-at-least-32-characters-long-yes';
  process.env.NEXTAUTH_URL ??= 'http://localhost:3000';
  process.env.ENCRYPTION_KEY ??= Buffer.from(new Uint8Array(32)).toString('base64');
});

import type { AdminAuthContext } from '../../src/lib/auth/admin-route-auth';

const adminCtx: AdminAuthContext = {
  ip: null,
  subject: { kind: 'admin', userId: 'u1', email: 'a@b.test', role: 'owner' },
};

function apiKeyCtx(licenseId: string | null): AdminAuthContext {
  return {
    ip: null,
    subject: { kind: 'api_key', apiKeyId: 'k1', apiKeyName: 'k', scopes: [], licenseId },
  };
}

describe('enforceLicenseAccess (multi-tenant isolation)', () => {
  it('allows an admin session for any license', async () => {
    const { enforceLicenseAccess } = await import('../../src/lib/auth/admin-route-auth');
    expect(enforceLicenseAccess(adminCtx, 'lic_anything')).toBeNull();
  });

  it('allows an unbound API key (licenseId null) for any license', async () => {
    const { enforceLicenseAccess } = await import('../../src/lib/auth/admin-route-auth');
    expect(enforceLicenseAccess(apiKeyCtx(null), 'lic_anything')).toBeNull();
  });

  it('allows a bound API key for its own license', async () => {
    const { enforceLicenseAccess } = await import('../../src/lib/auth/admin-route-auth');
    expect(enforceLicenseAccess(apiKeyCtx('lic_fidibus'), 'lic_fidibus')).toBeNull();
  });

  it('returns 404 for a bound API key requesting a foreign license', async () => {
    const { enforceLicenseAccess } = await import('../../src/lib/auth/admin-route-auth');
    const res = enforceLicenseAccess(apiKeyCtx('lic_fidibus'), 'lic_shuttle');
    expect(res).toBeInstanceOf(NextResponse);
    expect(res?.status).toBe(404);
  });
});
