import { NextResponse } from 'next/server';
import { listAllPublicKeys } from '@/lib/signing/signing-key-service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Public-key discovery for SDKs / offline verification.
 *
 * Returns the active + previously-rotated SPKI PEM for every product, keyed
 * by `kid`. SDKs cache this list and verify license tokens against the
 * matching public key. Including rotated-out keys allows tokens issued
 * before a rotation to keep validating during the grace window.
 */
export async function GET() {
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
}
