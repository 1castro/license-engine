import { describe, it, expect, beforeAll } from 'vitest';
import { SignJWT, generateKeyPair, jwtVerify, exportSPKI, importSPKI } from 'jose';
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
 * These tests focus on the algorithm-pinning + claim-validation behavior of
 * the verifier — i.e. they exercise the security-critical *verification*
 * pathway without booting Prisma. The full sign→DB→verify roundtrip is
 * covered by the end-to-end curl tests in Phase-3 verification.
 */
describe('verifyLicenseToken: algorithm pinning', () => {
  it('accepts a valid EdDSA token with the matching key', async () => {
    const { privateKey, publicKey } = await generateKeyPair('EdDSA');
    const token = await new SignJWT({ features: ['voice'] })
      .setProtectedHeader({ alg: 'EdDSA', kid: 'k1' })
      .setIssuer('license.test')
      .setAudience('avatar-pro')
      .setSubject('lic_abc')
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(privateKey);

    const { payload } = await jwtVerify(token, publicKey, {
      algorithms: ['EdDSA'],
      issuer: 'license.test',
      audience: 'avatar-pro',
    });
    expect(payload.sub).toBe('lic_abc');
  });

  it('rejects alg=none even if the token claims to be unsigned', async () => {
    // Hand-craft an unsigned JWT (the historic alg-confusion bug).
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({ sub: 'lic_evil', iss: 'license.test', aud: 'avatar-pro', exp: Math.floor(Date.now() / 1000) + 3600 }),
    ).toString('base64url');
    const evilToken = `${header}.${payload}.`;

    const { publicKey } = await generateKeyPair('EdDSA');
    await expect(
      jwtVerify(evilToken, publicKey, { algorithms: ['EdDSA'], issuer: 'license.test', audience: 'avatar-pro' }),
    ).rejects.toThrow();
  });

  it('rejects an HS256 token signed with the public key as the HMAC secret (alg confusion)', async () => {
    const { publicKey } = await generateKeyPair('EdDSA');
    const spki = await exportSPKI(publicKey);
    const evilSecret = new TextEncoder().encode(spki);

    const evilToken = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer('license.test')
      .setAudience('avatar-pro')
      .setSubject('lic_evil')
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(evilSecret);

    await expect(
      jwtVerify(evilToken, publicKey, {
        algorithms: ['EdDSA'],
        issuer: 'license.test',
        audience: 'avatar-pro',
      }),
    ).rejects.toThrow();
  });

  it('rejects a token with a wrong audience', async () => {
    const { privateKey, publicKey } = await generateKeyPair('EdDSA');
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: 'EdDSA' })
      .setIssuer('license.test')
      .setAudience('some-other-product')
      .setSubject('lic_abc')
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(privateKey);

    await expect(
      jwtVerify(token, publicKey, { algorithms: ['EdDSA'], issuer: 'license.test', audience: 'avatar-pro' }),
    ).rejects.toThrow();
  });

  it('rejects an expired token', async () => {
    const { privateKey, publicKey } = await generateKeyPair('EdDSA');
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: 'EdDSA' })
      .setIssuer('license.test')
      .setAudience('avatar-pro')
      .setSubject('lic_abc')
      .setIssuedAt(Math.floor(Date.now() / 1000) - 7200) // 2h in the past
      .setExpirationTime(Math.floor(Date.now() / 1000) - 3600) // 1h in the past
      .sign(privateKey);

    await expect(
      jwtVerify(token, publicKey, { algorithms: ['EdDSA'], issuer: 'license.test', audience: 'avatar-pro' }),
    ).rejects.toThrow();
  });

  it('rejects a token signed by a different key (signature mismatch)', async () => {
    const { privateKey: privA } = await generateKeyPair('EdDSA');
    const { publicKey: pubB } = await generateKeyPair('EdDSA');

    const token = await new SignJWT({})
      .setProtectedHeader({ alg: 'EdDSA' })
      .setIssuer('license.test')
      .setAudience('avatar-pro')
      .setSubject('lic_abc')
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(privA);

    await expect(
      jwtVerify(token, pubB, { algorithms: ['EdDSA'], issuer: 'license.test', audience: 'avatar-pro' }),
    ).rejects.toThrow();
  });
});

describe('public-key roundtrip via PEM', () => {
  it('roundtrips an Ed25519 public key through SPKI PEM', async () => {
    const { publicKey } = await generateKeyPair('EdDSA');
    const pem = await exportSPKI(publicKey);
    expect(pem).toMatch(/^-----BEGIN PUBLIC KEY-----/);
    const imported = (await importSPKI(pem, 'EdDSA')) as KeyObject;
    expect(imported).toBeDefined();
  });
});
