import { errors as joseErrors, importSPKI, jwtVerify } from 'jose';
import type { LicenseTokenClaims, PublicKeyEntry } from './types';
import { LicenseTokenInvalidError } from './errors';

const ALGORITHM = 'EdDSA' as const;

/**
 * Verifies a license JWT against the SDK's cached public-key set.
 *
 * Pins:
 *   - Algorithm = EdDSA (no `alg: none`, no HS256-confusion attack)
 *   - Audience = the configured product slug
 *   - Issuer  = the configured issuer (if given)
 *   - kid     = must match one of the cached keys for this product
 *
 * Throws LicenseTokenInvalidError on any failure; the caller maps that to
 * the appropriate user-facing error (server unreachable vs. revoked vs. …).
 */
export async function verifyLicenseToken(input: {
  token: string;
  publicKeys: PublicKeyEntry[];
  expectedProductSlug: string;
  expectedIssuer?: string;
}): Promise<LicenseTokenClaims> {
  const headerSegment = input.token.split('.')[0];
  if (!headerSegment) {
    throw new LicenseTokenInvalidError('malformed', 'Token has no header segment');
  }
  let header: { alg?: unknown; kid?: unknown };
  try {
    header = JSON.parse(base64UrlDecode(headerSegment));
  } catch {
    throw new LicenseTokenInvalidError('malformed', 'Token header is not valid JSON');
  }
  if (header.alg !== ALGORITHM) {
    throw new LicenseTokenInvalidError(
      'algorithm_mismatch',
      `Expected ${ALGORITHM}, got ${String(header.alg)}`,
    );
  }
  if (typeof header.kid !== 'string' || header.kid.length === 0) {
    throw new LicenseTokenInvalidError('malformed', 'Token header missing kid');
  }

  const candidate = input.publicKeys.find(
    (k) => k.kid === header.kid && k.productSlug === input.expectedProductSlug,
  );
  if (!candidate) {
    throw new LicenseTokenInvalidError(
      'unknown_kid',
      `No cached public key for kid=${header.kid} / product=${input.expectedProductSlug}`,
    );
  }

  let publicKey;
  try {
    publicKey = await importSPKI(candidate.publicKey, ALGORITHM);
  } catch (err) {
    throw new LicenseTokenInvalidError(
      'key_import_failed',
      err instanceof Error ? err.message : 'unknown',
    );
  }

  try {
    const { payload } = await jwtVerify(input.token, publicKey, {
      algorithms: [ALGORITHM],
      audience: input.expectedProductSlug,
      ...(input.expectedIssuer ? { issuer: input.expectedIssuer } : {}),
      // Tolerate small client/server clock skew so a freshly issued token isn't
      // rejected as not-yet-valid (nbf) or a near-boundary token as expired.
      // Mirrors the server verifier's tolerance.
      clockTolerance: '30s',
    });
    return payload as unknown as LicenseTokenClaims;
  } catch (err) {
    // Use jose's typed error classes — message-regex would silently mis-classify
    // when jose changes its wording. Check expired first so an expired token is
    // reported as `expired` rather than caught by the audience branch.
    if (err instanceof joseErrors.JWTExpired) {
      throw new LicenseTokenInvalidError('expired', err.message);
    }
    if (err instanceof joseErrors.JWTClaimValidationFailed) {
      // A failed claim check (audience, not-before, issuer …) is NOT a tampered
      // signature — jose already verified the signature before reaching claim
      // validation. Reporting it as `signature_invalid` would mislead callers
      // into suspecting a forged token / wrong key. Map the common claims to
      // their own codes; the rest stay as a generic claim failure.
      if (err.claim === 'aud') {
        throw new LicenseTokenInvalidError('audience_mismatch', err.message);
      }
      if (err.claim === 'nbf' || err.claim === 'iat') {
        throw new LicenseTokenInvalidError('not_yet_valid', err.message);
      }
      throw new LicenseTokenInvalidError('claim_invalid', err.message);
    }
    const message = err instanceof Error ? err.message : 'unknown';
    throw new LicenseTokenInvalidError('signature_invalid', message);
  }
}

function base64UrlDecode(input: string): string {
  // jose normally does this internally; replicating here for the header peek.
  let s = input.replace(/-/g, '+').replace(/_/g, '/');
  const pad = s.length % 4;
  if (pad === 2) s += '==';
  else if (pad === 3) s += '=';
  else if (pad !== 0) throw new Error('Invalid base64url length');
  if (typeof atob === 'function') {
    return decodeURIComponent(
      Array.from(atob(s), (c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join(''),
    );
  }
  // Node fallback.
  return Buffer.from(s, 'base64').toString('utf8');
}
