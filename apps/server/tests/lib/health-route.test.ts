import { describe, it, expect, beforeAll } from 'vitest';

const HEALTH_TOKEN = 'test-health-token-abc123';

beforeAll(() => {
  process.env.DATABASE_URL ??= 'postgresql://x:x@localhost:5432/x?schema=public';
  process.env.APP_BASE_URL ??= 'http://localhost:3000';
  process.env.JWT_ISSUER ??= 'license.test';
  process.env.NEXTAUTH_SECRET ??= 'test-secret-must-be-at-least-32-characters-long-yes';
  process.env.NEXTAUTH_URL ??= 'http://localhost:3000';
  process.env.ENCRYPTION_KEY ??= Buffer.from(new Uint8Array(32)).toString('base64');
  // Must be set before the route module first calls getEnv() (cached).
  process.env.HEALTH_CHECK_TOKEN = HEALTH_TOKEN;
});

/**
 * The health endpoint must be invisible from outside without the shared token.
 * Next.js rewrites all x-forwarded-* headers (even on localhost), so a token is
 * the only reliable gate. The Docker healthcheck + monitoring present it; every
 * other caller gets 404.
 *
 * The "valid token" cases fall through to the real checks (no DB in the test
 * env → 503); the point is only that it is NOT the 404 from the gate.
 */
describe('health route — token gate', () => {
  it('returns 404 without a token', async () => {
    const { GET } = await import('../../src/app/api/health/route');
    const res = await GET(new Request('http://x.test/api/health?level=live'));
    expect(res.status).toBe(404);
  });

  it('returns 404 with a wrong token', async () => {
    const { GET } = await import('../../src/app/api/health/route');
    const res = await GET(
      new Request('http://x.test/api/health?level=live', {
        headers: { 'x-health-token': 'wrong' },
      }),
    );
    expect(res.status).toBe(404);
  });

  it('does NOT gate when the correct token is in the x-health-token header', async () => {
    const { GET } = await import('../../src/app/api/health/route');
    const res = await GET(
      new Request('http://x.test/api/health?level=live', {
        headers: { 'x-health-token': HEALTH_TOKEN },
      }),
    );
    expect(res.status).not.toBe(404);
  });

  it('does NOT gate when the correct token is in the ?token= query', async () => {
    const { GET } = await import('../../src/app/api/health/route');
    const res = await GET(
      new Request(`http://x.test/api/health?level=live&token=${HEALTH_TOKEN}`),
    );
    expect(res.status).not.toBe(404);
  });

  it('is NOT fooled by x-forwarded headers (those are not the gate)', async () => {
    const { GET } = await import('../../src/app/api/health/route');
    // Correct token + proxy headers present → still served (gate is the token).
    const res = await GET(
      new Request('http://x.test/api/health?level=live', {
        headers: { 'x-health-token': HEALTH_TOKEN, 'x-forwarded-for': '203.0.113.7' },
      }),
    );
    expect(res.status).not.toBe(404);
  });
});
