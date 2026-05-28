import { describe, it, expect, beforeAll } from 'vitest';

beforeAll(() => {
  process.env.DATABASE_URL ??= 'postgresql://x:x@localhost:5432/x?schema=public';
  process.env.APP_BASE_URL ??= 'http://localhost:3000';
  process.env.JWT_ISSUER ??= 'license.test';
  process.env.NEXTAUTH_SECRET ??= 'test-secret-must-be-at-least-32-characters-long-yes';
  process.env.NEXTAUTH_URL ??= 'http://localhost:3000';
  process.env.ENCRYPTION_KEY ??= Buffer.from(new Uint8Array(32)).toString('base64');
});

/**
 * The health endpoint must be invisible from outside the reverse proxy.
 * Externally-proxied requests carry `x-forwarded-for` (set by NPM, not
 * strippable by the client) and must get 404. Internal requests (Docker
 * healthcheck over localhost, monitoring on the Docker net) carry no
 * `x-forwarded-for` and must NOT be blocked — they fall through to the actual
 * checks (which, without a DB in the test env, return 503; the point is that
 * it is NOT the 404 from the gate).
 *
 * `x-forwarded-host` must NOT trigger the gate — Next.js sets that header on
 * localhost requests too, so gating on it would 404 the internal healthcheck.
 */
describe('health route — external gate', () => {
  it('returns 404 when x-forwarded-for is present (proxied request)', async () => {
    const { GET } = await import('../../src/app/api/health/route');
    const req = new Request('http://license.tropicsoft.de/api/health?level=live', {
      headers: { 'x-forwarded-for': '203.0.113.7' },
    });
    const res = await GET(req);
    expect(res.status).toBe(404);
  });

  it('does NOT gate on x-forwarded-host alone (Next.js sets it internally)', async () => {
    const { GET } = await import('../../src/app/api/health/route');
    const req = new Request('http://localhost:3000/api/health?level=live', {
      headers: { 'x-forwarded-host': 'license.tropicsoft.de' },
    });
    const res = await GET(req);
    expect(res.status).not.toBe(404);
  });

  it('does NOT block an internal request without x-forwarded-for', async () => {
    const { GET } = await import('../../src/app/api/health/route');
    const req = new Request('http://localhost:3000/api/health?level=live');
    const res = await GET(req);
    expect(res.status).not.toBe(404);
  });
});
