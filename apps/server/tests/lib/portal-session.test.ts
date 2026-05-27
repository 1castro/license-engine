import { describe, it, expect, beforeAll } from 'vitest';

beforeAll(() => {
  process.env.DATABASE_URL ??= 'postgresql://x:x@localhost:5432/x?schema=public';
  process.env.APP_BASE_URL ??= 'http://localhost:3000';
  process.env.JWT_ISSUER ??= 'license.test';
  process.env.NEXTAUTH_SECRET ??= 'test-secret-must-be-at-least-32-characters-long-yes';
  process.env.NEXTAUTH_URL ??= 'http://localhost:3000';
  process.env.ENCRYPTION_KEY ??= Buffer.from(new Uint8Array(32)).toString('base64');
});

describe('portal session JWT', () => {
  it('roundtrips a session through sign + verify', async () => {
    const { signPortalSession, verifyPortalSession } = await import('../../src/lib/portal/session');
    const { token } = await signPortalSession({ customerId: 'c_1', email: 'a@b.test' });
    const payload = await verifyPortalSession(token);
    expect(payload).not.toBeNull();
    if (payload) {
      expect(payload.customerId).toBe('c_1');
      expect(payload.email).toBe('a@b.test');
      expect(payload.exp).toBeGreaterThan(payload.iat);
    }
  });

  it('returns null for a tampered token', async () => {
    const { signPortalSession, verifyPortalSession } = await import('../../src/lib/portal/session');
    const { token } = await signPortalSession({ customerId: 'c_1', email: 'a@b.test' });
    const tampered = token.slice(0, -1) + (token.endsWith('A') ? 'B' : 'A');
    expect(await verifyPortalSession(tampered)).toBeNull();
  });

  it('returns null for total garbage', async () => {
    const { verifyPortalSession } = await import('../../src/lib/portal/session');
    expect(await verifyPortalSession('not.a.jwt')).toBeNull();
    expect(await verifyPortalSession('')).toBeNull();
  });
});
