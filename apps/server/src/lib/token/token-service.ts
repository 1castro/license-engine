import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import { randomUUID } from 'node:crypto';
import type { KeyObject } from 'node:crypto';
import { getEnv } from '../env';
import { getActiveSigningKey, getAllPublicKeysForProduct, SIGNING_ALGORITHM } from '../signing/signing-key-service';

/**
 * JWT issuance and verification for license tokens.
 *
 * Signing: always Ed25519 / EdDSA via the product's active SigningKey.
 * Verification: PINS the algorithm to EdDSA. We never accept `alg: none`
 * or any other algorithm — defense against the classic JWT-library
 * algorithm-confusion class of bugs.
 *
 * The JWT `kid` header points at SigningKey.id so the verifier can pick the
 * right key from the product's keychain (active + previously rotated).
 */

export interface LicenseTokenBinding {
  type: string;
  hash: string;
}

export interface LicenseTokenClaims extends JWTPayload {
  /** License.id */
  sub: string;
  /** Product.slug */
  aud: string;
  /** Issuer from env */
  iss: string;
  /** End-user license key for client-side display only. */
  licenseKey: string;
  /** Active feature flags for this license. */
  features: string[];
  /** Bindings the client successfully passed at activation time, hashed. */
  bindings: LicenseTokenBinding[];
}

export interface SignLicenseTokenInput {
  license: {
    id: string;
    licenseKey: string;
    productId: string;
    featureFlags: string[];
  };
  product: {
    slug: string;
    jwtLifetimeHours: number;
  };
  bindings: LicenseTokenBinding[];
}

export interface SignedLicenseToken {
  token: string;
  expiresAt: Date;
  kid: string;
}

export async function signLicenseToken(input: SignLicenseTokenInput): Promise<SignedLicenseToken> {
  const { kid, privateKey } = await getActiveSigningKey(input.license.productId);
  const env = getEnv();
  const now = Math.floor(Date.now() / 1000);
  const exp = now + input.product.jwtLifetimeHours * 3600;

  const token = await new SignJWT({
    licenseKey: input.license.licenseKey,
    features: input.license.featureFlags,
    bindings: input.bindings,
  })
    .setProtectedHeader({ alg: SIGNING_ALGORITHM, kid, typ: 'JWT' })
    .setIssuer(env.JWT_ISSUER)
    .setAudience(input.product.slug)
    .setSubject(input.license.id)
    .setIssuedAt(now)
    .setNotBefore(now)
    .setExpirationTime(exp)
    .setJti(randomUUID())
    .sign(privateKey);

  return { token, expiresAt: new Date(exp * 1000), kid };
}

export class TokenVerificationError extends Error {
  constructor(message: string, public readonly code: 'invalid_signature' | 'expired' | 'malformed' | 'unknown_kid' | 'audience_mismatch') {
    super(message);
    this.name = 'TokenVerificationError';
  }
}

export interface VerifyLicenseTokenInput {
  token: string;
  /** Restrict accepted audience to this product slug. */
  expectedAudience: string;
  /** Restrict accepted issuer (defaults to env.JWT_ISSUER). */
  expectedIssuer?: string;
  /** Product whose key-chain is consulted. */
  productId: string;
}

export async function verifyLicenseToken(
  input: VerifyLicenseTokenInput,
): Promise<LicenseTokenClaims> {
  // Peek at the kid in the header so we can pick the right public key without
  // trying every key for the product (and without trusting unverified content).
  const headerSegment = input.token.split('.')[0];
  if (!headerSegment) {
    throw new TokenVerificationError('Token is malformed (missing header)', 'malformed');
  }
  let header: { kid?: unknown; alg?: unknown };
  try {
    header = JSON.parse(Buffer.from(headerSegment, 'base64url').toString('utf8'));
  } catch {
    throw new TokenVerificationError('Token header is not valid JSON', 'malformed');
  }
  if (header.alg !== SIGNING_ALGORITHM) {
    throw new TokenVerificationError(`Algorithm pinning: expected ${SIGNING_ALGORITHM}, got ${String(header.alg)}`, 'malformed');
  }
  if (typeof header.kid !== 'string' || header.kid.length === 0) {
    throw new TokenVerificationError('Token header missing kid', 'malformed');
  }

  const keys = await getAllPublicKeysForProduct(input.productId);
  const publicKey = keys.get(header.kid);
  if (!publicKey) {
    throw new TokenVerificationError(`Unknown kid: ${header.kid}`, 'unknown_kid');
  }

  const env = getEnv();
  try {
    const { payload } = await jwtVerify(input.token, publicKey, {
      algorithms: [SIGNING_ALGORITHM],
      issuer: input.expectedIssuer ?? env.JWT_ISSUER,
      audience: input.expectedAudience,
    });
    return payload as LicenseTokenClaims;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown';
    if (/expired/i.test(message)) {
      throw new TokenVerificationError(message, 'expired');
    }
    if (/audience/i.test(message)) {
      throw new TokenVerificationError(message, 'audience_mismatch');
    }
    throw new TokenVerificationError(message, 'invalid_signature');
  }
}

/** Helper for tests: import a key without going through Prisma. */
export type { KeyObject };
