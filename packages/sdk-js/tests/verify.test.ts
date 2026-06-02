import { describe, it, expect } from 'vitest';
import { SignJWT, generateKeyPair, exportSPKI } from 'jose';
import { verifyLicenseToken } from '../src/verify';
import { LicenseTokenInvalidError } from '../src/errors';
import type { PublicKeyEntry } from '../src/types';

async function makeKeyEntry(productSlug: string, kid: string): Promise<{
  publicKeyEntry: PublicKeyEntry;
  privateKey: import('jose').CryptoKey | Uint8Array;
}> {
  const { publicKey, privateKey } = await generateKeyPair('EdDSA');
  const spki = await exportSPKI(publicKey);
  return {
    publicKeyEntry: {
      kid,
      productId: 'p_' + kid,
      productSlug,
      algorithm: 'Ed25519',
      publicKey: spki,
      isActive: true,
      createdAt: new Date().toISOString(),
      rotatedAt: null,
    },
    privateKey,
  };
}

describe('SDK verifyLicenseToken', () => {
  it('accepts a valid Ed25519 token with matching cached key', async () => {
    const { publicKeyEntry, privateKey } = await makeKeyEntry('avatar-pro', 'kid_a');
    const token = await new SignJWT({ features: ['voice'] })
      .setProtectedHeader({ alg: 'EdDSA', kid: 'kid_a', typ: 'JWT' })
      .setIssuer('license.test')
      .setAudience('avatar-pro')
      .setSubject('lic_1')
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(privateKey);

    const claims = await verifyLicenseToken({
      token,
      publicKeys: [publicKeyEntry],
      expectedProductSlug: 'avatar-pro',
      expectedIssuer: 'license.test',
    });
    expect(claims.sub).toBe('lic_1');
    expect(claims.features).toEqual(['voice']);
  });

  it('rejects alg=none', async () => {
    const { publicKeyEntry } = await makeKeyEntry('avatar-pro', 'kid_a');
    const header = Buffer.from(JSON.stringify({ alg: 'none', kid: 'kid_a', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({ sub: 'evil', iss: 'license.test', aud: 'avatar-pro', exp: Math.floor(Date.now() / 1000) + 3600 }),
    ).toString('base64url');
    const evilToken = `${header}.${payload}.`;
    await expect(
      verifyLicenseToken({
        token: evilToken,
        publicKeys: [publicKeyEntry],
        expectedProductSlug: 'avatar-pro',
      }),
    ).rejects.toBeInstanceOf(LicenseTokenInvalidError);
  });

  it('rejects an unknown kid', async () => {
    const { publicKeyEntry, privateKey } = await makeKeyEntry('avatar-pro', 'kid_a');
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: 'EdDSA', kid: 'kid_does_not_exist', typ: 'JWT' })
      .setIssuer('license.test')
      .setAudience('avatar-pro')
      .setSubject('lic_1')
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(privateKey);

    await expect(
      verifyLicenseToken({
        token,
        publicKeys: [publicKeyEntry],
        expectedProductSlug: 'avatar-pro',
      }),
    ).rejects.toThrowError(/unknown_kid|signature_invalid/);
  });

  it('rejects a different audience (cross-product token)', async () => {
    const { publicKeyEntry, privateKey } = await makeKeyEntry('avatar-pro', 'kid_a');
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: 'EdDSA', kid: 'kid_a', typ: 'JWT' })
      .setIssuer('license.test')
      .setAudience('some-other-product')
      .setSubject('lic_1')
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(privateKey);

    await expect(
      verifyLicenseToken({
        token,
        publicKeys: [publicKeyEntry],
        expectedProductSlug: 'avatar-pro',
      }),
    ).rejects.toBeInstanceOf(LicenseTokenInvalidError);
  });

  // --- N6: clockTolerance absorbs small clock skew --------------------------
  it('accepts a token whose nbf is a few seconds in the future (clock skew)', async () => {
    const { publicKeyEntry, privateKey } = await makeKeyEntry('avatar-pro', 'kid_a');
    const now = Math.floor(Date.now() / 1000);
    const token = await new SignJWT({ features: [] })
      .setProtectedHeader({ alg: 'EdDSA', kid: 'kid_a', typ: 'JWT' })
      .setIssuer('license.test')
      .setAudience('avatar-pro')
      .setSubject('lic_1')
      .setIssuedAt(now)
      .setNotBefore(now + 10) // client clock 10s behind the signing server
      .setExpirationTime(now + 3600)
      .sign(privateKey);

    const claims = await verifyLicenseToken({
      token,
      publicKeys: [publicKeyEntry],
      expectedProductSlug: 'avatar-pro',
      expectedIssuer: 'license.test',
    });
    expect(claims.sub).toBe('lic_1');
  });

  it('accepts a token that expired a few seconds ago (clock skew within tolerance)', async () => {
    const { publicKeyEntry, privateKey } = await makeKeyEntry('avatar-pro', 'kid_a');
    const now = Math.floor(Date.now() / 1000);
    const token = await new SignJWT({ features: [] })
      .setProtectedHeader({ alg: 'EdDSA', kid: 'kid_a', typ: 'JWT' })
      .setIssuer('license.test')
      .setAudience('avatar-pro')
      .setSubject('lic_1')
      .setIssuedAt(now - 3600)
      .setExpirationTime(now - 10) // expired 10s ago, inside the 30s tolerance
      .sign(privateKey);

    const claims = await verifyLicenseToken({
      token,
      publicKeys: [publicKeyEntry],
      expectedProductSlug: 'avatar-pro',
      expectedIssuer: 'license.test',
    });
    expect(claims.sub).toBe('lic_1');
  });

  // --- N7: not-yet-valid is its own code, not signature_invalid -------------
  it('reports a token far before its nbf as not_yet_valid, not signature_invalid', async () => {
    const { publicKeyEntry, privateKey } = await makeKeyEntry('avatar-pro', 'kid_a');
    const now = Math.floor(Date.now() / 1000);
    const token = await new SignJWT({ features: [] })
      .setProtectedHeader({ alg: 'EdDSA', kid: 'kid_a', typ: 'JWT' })
      .setIssuer('license.test')
      .setAudience('avatar-pro')
      .setSubject('lic_1')
      .setIssuedAt(now)
      .setNotBefore(now + 600) // 10 min in the future — well past the tolerance
      .setExpirationTime(now + 3600)
      .sign(privateKey);

    await expect(
      verifyLicenseToken({
        token,
        publicKeys: [publicKeyEntry],
        expectedProductSlug: 'avatar-pro',
        expectedIssuer: 'license.test',
      }),
    ).rejects.toMatchObject({ code: 'not_yet_valid' });
  });
});
