import { describe, it, expect } from 'vitest';
import { seedProduct } from './helpers';

async function callPublicKeys(ip = '203.0.113.150') {
  const { GET } = await import('@/app/api/v1/.well-known/public-keys/route');
  const req = new Request('http://localhost/api/v1/.well-known/public-keys', {
    headers: { 'x-forwarded-for': ip },
  });
  const res = await GET(req);
  const json = (await res.json()) as Record<string, unknown>;
  return { status: res.status, json };
}

describe('GET /api/v1/.well-known/public-keys (#12)', () => {
  it('returns the product key chain', async () => {
    await seedProduct('fahrdienst'); // auto-provisions a signing key
    const res = await callPublicKeys('203.0.113.150');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.json.keys)).toBe(true);
    expect((res.json.keys as unknown[]).length).toBeGreaterThan(0);
  });

  it('rate-limits a flood from one IP with a uniform JSON error (not raw HTML)', async () => {
    await seedProduct('fahrdienst');
    let limited: { status: number; json: Record<string, unknown> } | null = null;
    // discoveryLimiter capacity is 30/min — the 31st call from one IP must 429.
    for (let i = 0; i < 35; i++) {
      const res = await callPublicKeys('203.0.113.151');
      if (res.status === 429) {
        limited = res;
        break;
      }
    }
    expect(limited).not.toBeNull();
    expect((limited!.json.error as { code: string }).code).toBe('rate_limited');
  });
});
