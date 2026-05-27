import { describe, it, expect, beforeAll } from 'vitest';

beforeAll(() => {
  process.env.DATABASE_URL ??= 'postgresql://x:x@localhost:5432/x?schema=public';
  process.env.APP_BASE_URL ??= 'http://localhost:3000';
  process.env.JWT_ISSUER ??= 'license.test';
  process.env.NEXTAUTH_SECRET ??= 'test-secret-must-be-at-least-32-characters-long-yes';
  process.env.NEXTAUTH_URL ??= 'http://localhost:3000';
  process.env.ENCRYPTION_KEY ??= Buffer.from(new Uint8Array(32)).toString('base64');
});

describe('hashToken (SDK-side function for auth tokens)', () => {
  it('is deterministic for the same input', async () => {
    const { hashToken } = await import('../../src/lib/portal/auth-token');
    expect(hashToken('abc')).toBe(hashToken('abc'));
  });

  it('produces a 64-char hex digest', async () => {
    const { hashToken } = await import('../../src/lib/portal/auth-token');
    expect(hashToken('whatever')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('differs for different inputs', async () => {
    const { hashToken } = await import('../../src/lib/portal/auth-token');
    expect(hashToken('abc')).not.toBe(hashToken('abd'));
  });

  it('does not leak the plaintext in the digest', async () => {
    const { hashToken } = await import('../../src/lib/portal/auth-token');
    const digest = hashToken('hunter2-the-real-password');
    expect(digest).not.toContain('hunter');
    expect(digest).not.toContain('password');
  });
});
