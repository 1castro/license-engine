import { describe, it, expect, beforeAll, vi } from 'vitest';
import { SignJWT, generateKeyPair, exportSPKI } from 'jose';
import type { KeyObject } from 'node:crypto';

beforeAll(() => {
  process.env.DATABASE_URL ??= 'postgresql://x:x@localhost:5432/x?schema=public';
  process.env.APP_BASE_URL ??= 'http://localhost:3000';
  process.env.JWT_ISSUER ??= 'license.test';
  process.env.NEXTAUTH_SECRET ??= 'test-secret-must-be-at-least-32-characters-long-yes';
  process.env.NEXTAUTH_URL ??= 'http://localhost:3000';
  process.env.ENCRYPTION_KEY ??= Buffer.from(new Uint8Array(32)).toString('base64');
});

/**
 * Mock the signing-key-service so we can drive the key-chain directly without
 * Prisma. Our verifyLicenseToken consults `getAllPublicKeysForProduct` to look
 * up a public key by kid; we expose a setter the tests use to seed it.
 */
const keyChain: Map<string, KeyObject> = new Map();
vi.mock('../../src/lib/signing/signing-key-service', async () => {
  const actual = await vi.importActual<typeof import('../../src/lib/signing/signing-key-service')>(
    '../../src/lib/signing/signing-key-service',
  );
  return {
    ...actual,
    getAllPublicKeysForProduct: vi.fn(async () => keyChain),
  };
});

const PRODUCT_ID = 'prod_test';
const PRODUCT_SLUG = 'avatar-pro';
const ISSUER = 'license.test';

async function freshKey() {
  return await generateKeyPair('EdDSA');
}

async function signWith(opts: {
  privateKey: CryptoKey;
  alg?: string;
  kid?: string;
  issuer?: string;
  audience?: string;
  exp?: number;
  payload?: Record<string, unknown>;
}) {
  const header: Record<string, unknown> = { alg: opts.alg ?? 'EdDSA', typ: 'JWT' };
  if (opts.kid !== undefined) header.kid = opts.kid;
  const jwt = new SignJWT(opts.payload ?? {})
    .setProtectedHeader(header as Parameters<SignJWT['setProtectedHeader']>[0])
    .setIssuer(opts.issuer ?? ISSUER)
    .setAudience(opts.audience ?? PRODUCT_SLUG)
    .setSubject('lic_test')
    .setIssuedAt();
  if (opts.exp !== undefined) {
    jwt.setExpirationTime(opts.exp);
  } else {
    jwt.setExpirationTime('1h');
  }
  return await jwt.sign(opts.privateKey);
}

describe('verifyLicenseToken (server wrapper)', () => {
  it('accepts a valid token whose kid is in the product key-chain', async () => {
    const { verifyLicenseToken } = await import('../../src/lib/token/token-service');
    const { privateKey, publicKey } = await freshKey();
    keyChain.clear();
    keyChain.set('k-active', publicKey as unknown as KeyObject);

    const token = await signWith({ privateKey, kid: 'k-active', payload: { licenseKey: 'TR0P-AAAA-BBBB-CCCC-DDDD', features: [], bindings: [] } });
    const claims = await verifyLicenseToken({
      token,
      expectedAudience: PRODUCT_SLUG,
      productId: PRODUCT_ID,
    });
    expect(claims.sub).toBe('lic_test');
    expect(claims.aud).toBe(PRODUCT_SLUG);
    expect(claims.iss).toBe(ISSUER);
  });

  it('rejects a hand-crafted alg=none token (algorithm-confusion class)', async () => {
    const { verifyLicenseToken, TokenVerificationError } = await import('../../src/lib/token/token-service');
    keyChain.clear();
    // No real signing — assemble an unsigned JWT directly.
    const header = Buffer.from(JSON.stringify({ alg: 'none', kid: 'k-active', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({
        sub: 'lic_evil',
        iss: ISSUER,
        aud: PRODUCT_SLUG,
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
    ).toString('base64url');
    const token = `${header}.${payload}.`;

    await expect(
      verifyLicenseToken({ token, expectedAudience: PRODUCT_SLUG, productId: PRODUCT_ID }),
    ).rejects.toBeInstanceOf(TokenVerificationError);
  });

  it('rejects a token whose kid is not in the product key-chain', async () => {
    const { verifyLicenseToken, TokenVerificationError } = await import('../../src/lib/token/token-service');
    const { privateKey, publicKey } = await freshKey();
    keyChain.clear();
    keyChain.set('k-active', publicKey as unknown as KeyObject);

    const token = await signWith({ privateKey, kid: 'k-unknown' });

    try {
      await verifyLicenseToken({ token, expectedAudience: PRODUCT_SLUG, productId: PRODUCT_ID });
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(TokenVerificationError);
      expect((err as InstanceType<typeof TokenVerificationError>).code).toBe('unknown_kid');
    }
  });

  it('rejects HS256 token signed with the public key as HMAC secret (alg-confusion variant)', async () => {
    const { verifyLicenseToken, TokenVerificationError } = await import('../../src/lib/token/token-service');
    const { publicKey } = await freshKey();
    keyChain.clear();
    keyChain.set('k-active', publicKey as unknown as KeyObject);

    const spki = await exportSPKI(publicKey);
    const evilSecret = new TextEncoder().encode(spki);
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256', kid: 'k-active', typ: 'JWT' })
      .setIssuer(ISSUER)
      .setAudience(PRODUCT_SLUG)
      .setSubject('lic_evil')
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(evilSecret);

    try {
      await verifyLicenseToken({ token, expectedAudience: PRODUCT_SLUG, productId: PRODUCT_ID });
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(TokenVerificationError);
      // alg-pinning kicks in before kid lookup, so this gets flagged as malformed.
      expect((err as InstanceType<typeof TokenVerificationError>).code).toBe('malformed');
    }
  });

  it('rejects a token with no kid in header', async () => {
    const { verifyLicenseToken, TokenVerificationError } = await import('../../src/lib/token/token-service');
    const { privateKey } = await freshKey();
    keyChain.clear();

    const token = await signWith({ privateKey });
    try {
      await verifyLicenseToken({ token, expectedAudience: PRODUCT_SLUG, productId: PRODUCT_ID });
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(TokenVerificationError);
      expect((err as InstanceType<typeof TokenVerificationError>).code).toBe('malformed');
    }
  });

  it('rejects a token whose header is not valid base64url JSON', async () => {
    const { verifyLicenseToken, TokenVerificationError } = await import('../../src/lib/token/token-service');
    const token = 'not-json.payload.sig';
    try {
      await verifyLicenseToken({ token, expectedAudience: PRODUCT_SLUG, productId: PRODUCT_ID });
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(TokenVerificationError);
      expect((err as InstanceType<typeof TokenVerificationError>).code).toBe('malformed');
    }
  });

  it('rejects a token whose audience does not match', async () => {
    const { verifyLicenseToken, TokenVerificationError } = await import('../../src/lib/token/token-service');
    const { privateKey, publicKey } = await freshKey();
    keyChain.clear();
    keyChain.set('k-active', publicKey as unknown as KeyObject);

    const token = await signWith({ privateKey, kid: 'k-active', audience: 'some-other-product' });
    try {
      await verifyLicenseToken({ token, expectedAudience: PRODUCT_SLUG, productId: PRODUCT_ID });
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(TokenVerificationError);
      expect((err as InstanceType<typeof TokenVerificationError>).code).toBe('audience_mismatch');
    }
  });

  it('rejects an expired token', async () => {
    const { verifyLicenseToken, TokenVerificationError } = await import('../../src/lib/token/token-service');
    const { privateKey, publicKey } = await freshKey();
    keyChain.clear();
    keyChain.set('k-active', publicKey as unknown as KeyObject);

    const token = await signWith({
      privateKey,
      kid: 'k-active',
      exp: Math.floor(Date.now() / 1000) - 3600, // 1h ago
    });
    try {
      await verifyLicenseToken({ token, expectedAudience: PRODUCT_SLUG, productId: PRODUCT_ID });
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(TokenVerificationError);
      expect((err as InstanceType<typeof TokenVerificationError>).code).toBe('expired');
    }
  });

  it('rejects a token signed with a different private key (signature mismatch)', async () => {
    const { verifyLicenseToken, TokenVerificationError } = await import('../../src/lib/token/token-service');
    const { privateKey: privEvil } = await freshKey();
    const { publicKey: pubLegit } = await freshKey();
    keyChain.clear();
    keyChain.set('k-active', pubLegit as unknown as KeyObject);

    const token = await signWith({ privateKey: privEvil, kid: 'k-active' });
    try {
      await verifyLicenseToken({ token, expectedAudience: PRODUCT_SLUG, productId: PRODUCT_ID });
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(TokenVerificationError);
      expect((err as InstanceType<typeof TokenVerificationError>).code).toBe('invalid_signature');
    }
  });

  it('rejects a token issued by a wrong issuer', async () => {
    const { verifyLicenseToken, TokenVerificationError } = await import('../../src/lib/token/token-service');
    const { privateKey, publicKey } = await freshKey();
    keyChain.clear();
    keyChain.set('k-active', publicKey as unknown as KeyObject);

    const token = await signWith({ privateKey, kid: 'k-active', issuer: 'evil-issuer' });
    try {
      await verifyLicenseToken({ token, expectedAudience: PRODUCT_SLUG, productId: PRODUCT_ID });
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(TokenVerificationError);
      expect((err as InstanceType<typeof TokenVerificationError>).code).toBe('invalid_signature');
    }
  });
});
