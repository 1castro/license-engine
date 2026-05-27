import { describe, it, expect, beforeAll } from 'vitest';

beforeAll(() => {
  process.env.DATABASE_URL ??= 'postgresql://x:x@localhost:5432/x?schema=public';
  process.env.APP_BASE_URL ??= 'http://localhost:3000';
  process.env.JWT_ISSUER ??= 'license.test';
  process.env.NEXTAUTH_SECRET ??= 'test-secret-must-be-at-least-32-characters-long-yes';
  process.env.NEXTAUTH_URL ??= 'http://localhost:3000';
  process.env.ENCRYPTION_KEY ??= Buffer.from(new Uint8Array(32)).toString('base64');
});

describe('extractApiKeyPlaintext', () => {
  it('reads Authorization: Bearer', async () => {
    const { extractApiKeyPlaintext } = await import('../../src/lib/auth/api-key-middleware');
    const req = new Request('http://x', { headers: { authorization: 'Bearer lek_xyz' } });
    expect(extractApiKeyPlaintext(req)).toBe('lek_xyz');
  });

  it('falls back to X-API-Key', async () => {
    const { extractApiKeyPlaintext } = await import('../../src/lib/auth/api-key-middleware');
    const req = new Request('http://x', { headers: { 'x-api-key': 'lek_xyz' } });
    expect(extractApiKeyPlaintext(req)).toBe('lek_xyz');
  });

  it('returns null when no key header is present', async () => {
    const { extractApiKeyPlaintext } = await import('../../src/lib/auth/api-key-middleware');
    expect(extractApiKeyPlaintext(new Request('http://x'))).toBeNull();
  });

  it('is case-insensitive on Bearer keyword', async () => {
    const { extractApiKeyPlaintext } = await import('../../src/lib/auth/api-key-middleware');
    const req = new Request('http://x', { headers: { authorization: 'bearer lek_xyz' } });
    expect(extractApiKeyPlaintext(req)).toBe('lek_xyz');
  });
});

describe('hasScope', () => {
  it('returns false for null context', async () => {
    const { hasScope } = await import('../../src/lib/auth/api-key-middleware');
    expect(hasScope(null, 'licenses:read')).toBe(false);
  });

  it('returns true when the scope is present', async () => {
    const { hasScope } = await import('../../src/lib/auth/api-key-middleware');
    expect(
      hasScope(
        { apiKeyId: 'x', apiKeyName: 'y', scopes: ['licenses:read', 'licenses:write'] },
        'licenses:write',
      ),
    ).toBe(true);
  });

  it('returns false when the scope is missing', async () => {
    const { hasScope } = await import('../../src/lib/auth/api-key-middleware');
    expect(
      hasScope({ apiKeyId: 'x', apiKeyName: 'y', scopes: ['licenses:read'] }, 'licenses:write'),
    ).toBe(false);
  });
});
