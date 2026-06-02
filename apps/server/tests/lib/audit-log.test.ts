import { describe, it, expect, beforeAll } from 'vitest';

// Provide minimum env for env.ts to validate before importing audit-log.
beforeAll(() => {
  process.env.DATABASE_URL ??= 'postgresql://x:x@localhost:5432/x?schema=public';
  process.env.APP_BASE_URL ??= 'http://localhost:3000';
  process.env.JWT_ISSUER ??= 'license.test';
  process.env.NEXTAUTH_SECRET ??= 'test-secret-must-be-at-least-32-characters-long-yes';
  process.env.NEXTAUTH_URL ??= 'http://localhost:3000';
  process.env.ENCRYPTION_KEY ??= Buffer.from(new Uint8Array(32)).toString('base64');
  // extractIp returns null by default unless we explicitly trust proxy headers;
  // these tests assert the proxy-trusting branch.
  process.env.TRUST_PROXY_HEADERS = 'true';
});

describe('hashIp', () => {
  it('returns null for null / empty input', async () => {
    const { hashIp } = await import('../../src/lib/audit/audit-log');
    expect(hashIp(null)).toBeNull();
    expect(hashIp(undefined)).toBeNull();
    expect(hashIp('')).toBeNull();
    expect(hashIp('   ')).toBeNull();
  });

  it('produces a stable 32-char hex digest for the same input', async () => {
    const { hashIp } = await import('../../src/lib/audit/audit-log');
    const a = hashIp('1.2.3.4');
    const b = hashIp('1.2.3.4');
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{32}$/);
  });

  it('produces different digests for different IPs', async () => {
    const { hashIp } = await import('../../src/lib/audit/audit-log');
    expect(hashIp('1.2.3.4')).not.toBe(hashIp('1.2.3.5'));
  });

  it('does not leak the IP in the digest (no obvious substring match)', async () => {
    const { hashIp } = await import('../../src/lib/audit/audit-log');
    const digest = hashIp('192.168.1.42');
    expect(digest).not.toContain('192');
    expect(digest).not.toContain('168');
  });
});

describe('extractIp', () => {
  it('prefers x-real-ip (proxy-overwritten, not spoofable) over x-forwarded-for', async () => {
    const { extractIp } = await import('../../src/lib/audit/audit-log');
    // Attacker spoofs XFF[0]; the proxy appended the real peer and set X-Real-IP.
    const req = new Request('http://x.test', {
      headers: { 'x-forwarded-for': '1.2.3.4, 10.0.0.9', 'x-real-ip': '10.0.0.9' },
    });
    expect(extractIp(req)).toBe('10.0.0.9');
  });

  it('does NOT trust the first x-forwarded-for entry (anti-spoof)', async () => {
    const { extractIp } = await import('../../src/lib/audit/audit-log');
    // No X-Real-IP → fall back to XFF, but take the LAST (proxy-appended) entry,
    // never the client-controlled first one.
    const req = new Request('http://x.test', {
      headers: { 'x-forwarded-for': '1.2.3.4, 10.0.0.2' },
    });
    expect(extractIp(req)).toBe('10.0.0.2');
  });

  it('uses x-real-ip when it is the only header', async () => {
    const { extractIp } = await import('../../src/lib/audit/audit-log');
    const req = new Request('http://x.test', { headers: { 'x-real-ip': '10.0.0.7' } });
    expect(extractIp(req)).toBe('10.0.0.7');
  });

  it('uses the single x-forwarded-for entry from an overwriting proxy', async () => {
    const { extractIp } = await import('../../src/lib/audit/audit-log');
    const req = new Request('http://x.test', { headers: { 'x-forwarded-for': '10.0.0.5' } });
    expect(extractIp(req)).toBe('10.0.0.5');
  });

  it('falls back to x-forwarded-for last entry when x-real-ip is blank', async () => {
    const { extractIp } = await import('../../src/lib/audit/audit-log');
    const req = new Request('http://x.test', {
      headers: { 'x-real-ip': '   ', 'x-forwarded-for': '1.2.3.4, 10.0.0.2' },
    });
    expect(extractIp(req)).toBe('10.0.0.2');
  });

  it('returns null when no IP header is present', async () => {
    const { extractIp } = await import('../../src/lib/audit/audit-log');
    const req = new Request('http://x.test');
    expect(extractIp(req)).toBeNull();
  });
});

describe('scrubMetadata', () => {
  it('redacts keys matching password / secret / token / api_key / private', async () => {
    const { __internal } = await import('../../src/lib/audit/audit-log');
    const cleaned = __internal.scrubMetadata({
      action: 'rotate',
      password: 'plaintext',
      apiSecret: 'sk_live_xxx',
      auth_token: 'eyJ...',
      api_key: 'lek_...',
      privateKey: 'BEGIN PRIVATE KEY',
      safeField: 'kept',
    });
    expect(cleaned).toMatchObject({
      action: 'rotate',
      password: '[redacted]',
      apiSecret: '[redacted]',
      auth_token: '[redacted]',
      api_key: '[redacted]',
      privateKey: '[redacted]',
      safeField: 'kept',
    });
  });

  it('recurses into nested objects', async () => {
    const { __internal } = await import('../../src/lib/audit/audit-log');
    const cleaned = __internal.scrubMetadata({
      nested: { password: 'x', value: 1 },
    }) as { nested: { password: string; value: number } };
    expect(cleaned.nested.password).toBe('[redacted]');
    expect(cleaned.nested.value).toBe(1);
  });

  it('handles arrays', async () => {
    const { __internal } = await import('../../src/lib/audit/audit-log');
    const cleaned = __internal.scrubMetadata([
      { token: 'a' },
      { token: 'b' },
    ]) as Array<{ token: string }>;
    expect(cleaned[0]!.token).toBe('[redacted]');
    expect(cleaned[1]!.token).toBe('[redacted]');
  });
});
