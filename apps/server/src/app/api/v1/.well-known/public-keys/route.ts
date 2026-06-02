import { NextResponse } from 'next/server';
import { listAllPublicKeys } from '@/lib/signing/signing-key-service';
import { discoveryLimiter } from '@/lib/auth/rate-limit';
import { extractIp, hashIp } from '@/lib/audit';
import { getLogger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function jsonError(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

/**
 * Public-key discovery for SDKs / offline verification.
 *
 * Returns the active + previously-rotated SPKI PEM for every product, keyed
 * by `kid`. SDKs cache this list and verify license tokens against the
 * matching public key. Including rotated-out keys allows tokens issued
 * before a rotation to keep validating during the grace window.
 *
 * Rate-limited per IP and wrapped in a uniform 500 envelope, consistent with
 * the other public endpoints (activate/recheck/deactivate).
 */
export async function GET(req: Request) {
  // Per-IP rate-limit only when a trustworthy client IP is available
  // (TRUST_PROXY_HEADERS on). Without it, hashIp is null and keying every
  // request to one 'no-ip' bucket would impose a single global cap on all
  // clients — worse than the unthrottled-but-CDN-cached prior behaviour.
  const ipHash = hashIp(extractIp(req));
  if (ipHash && !discoveryLimiter.tryConsume(ipHash)) {
    return jsonError(429, 'rate_limited', 'Too many discovery requests, slow down');
  }
  try {
    const keys = await listAllPublicKeys();
    return NextResponse.json(
      { keys },
      {
        headers: {
          // Allow caching at the CDN/edge for a short window; SDKs typically
          // refresh weekly which is well past this.
          'Cache-Control': 'public, max-age=300, s-maxage=300',
        },
      },
    );
  } catch (err) {
    // Never leak a raw Next.js HTML 500 — the SDK expects the uniform JSON shape.
    getLogger().error({ event: 'public_keys.internal_error', err }, 'Failed to list public keys');
    return jsonError(500, 'internal_error', 'Internal server error');
  }
}
