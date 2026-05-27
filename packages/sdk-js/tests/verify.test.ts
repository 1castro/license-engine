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
});
