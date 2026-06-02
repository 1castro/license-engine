import { describe, it, expect, beforeEach } from 'vitest';
import { SignJWT, generateKeyPair, exportSPKI } from 'jose';
import { createLicenseClient } from '../src/client';
import { createMemoryStorage } from '../src/storage/memory';
import {
  BindingsReleasedError,
  LicenseConfigError,
  LicenseExpiredError,
  LicenseRevokedError,
  LicenseTokenInvalidError,
  ServerUnreachableError,
} from '../src/errors';
import type { PublicKeyEntry, StorageAdapter } from '../src/types';

const SERVER = 'https://license.test';
const PRODUCT = 'fahrdienst';
const ISSUER = 'license.test';
const KID = 'kid_a';
const VALID_KEY = 'TR0P-VMYB-HKMJ-BRX6-19X0'; // Damm-valid fixture (see license-key.test.ts)

let privateKey: import('jose').CryptoKey | Uint8Array;
let publicKeyEntry: PublicKeyEntry;

beforeEach(async () => {
  const kp = await generateKeyPair('EdDSA');
  privateKey = kp.privateKey;
  const spki = await exportSPKI(kp.publicKey);
  publicKeyEntry = {
    kid: KID,
    productId: 'p_1',
    productSlug: PRODUCT,
    algorithm: 'Ed25519',
    publicKey: spki,
    isActive: true,
    createdAt: new Date().toISOString(),
    rotatedAt: null,
  };
});

interface TokenOpts {
  expSeconds?: number; // exp relative to now
  features?: unknown; // allow omitting / non-array for the N9 test
  bindings?: Array<{ type: string; hash: string }>;
}

async function signServerToken(opts: TokenOpts = {}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const builder = new SignJWT({
    ...(opts.features === undefined ? {} : { features: opts.features }),
    bindings: opts.bindings ?? [],
  })
    .setProtectedHeader({ alg: 'EdDSA', kid: KID, typ: 'JWT' })
    .setIssuer(ISSUER)
    .setAudience(PRODUCT)
    .setSubject('lic_1')
    .setIssuedAt(now)
    .setExpirationTime(now + (opts.expSeconds ?? 3600));
  return builder.sign(privateKey);
}

/** Minimal JSON Response factory. */
function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/**
 * Configurable fetch stub. The .well-known/public-keys GET always succeeds;
 * activate/recheck/deactivate route to per-test handlers. Records hits.
 */
function makeFetch(handlers: {
  activate?: () => Promise<Response> | Response;
  recheck?: () => Promise<Response> | Response;
  deactivate?: () => Promise<Response> | Response;
  publicKeys?: () => Promise<Response> | Response;
}): { fetchImpl: typeof fetch; hits: Record<string, number> } {
  const hits: Record<string, number> = { activate: 0, recheck: 0, deactivate: 0, publicKeys: 0 };
  const fetchImpl = (async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.includes('/.well-known/public-keys')) {
      hits.publicKeys++;
      return handlers.publicKeys ? handlers.publicKeys() : json(200, { keys: [publicKeyEntry] });
    }
    if (url.includes('/activate')) {
      hits.activate++;
      return handlers.activate ? handlers.activate() : json(500, { error: { code: 'internal_error' } });
    }
    if (url.includes('/recheck')) {
      hits.recheck++;
      return handlers.recheck ? handlers.recheck() : json(500, { error: { code: 'internal_error' } });
    }
    if (url.includes('/deactivate')) {
      hits.deactivate++;
      return handlers.deactivate ? handlers.deactivate() : json(500, { error: { code: 'internal_error' } });
    }
    throw new Error(`unexpected fetch: ${url}`);
  }) as unknown as typeof fetch;
  return { fetchImpl, hits };
}

function makeClient(fetchImpl: typeof fetch, storage: StorageAdapter = createMemoryStorage()) {
  return {
    client: createLicenseClient({
      serverUrl: SERVER,
      productSlug: PRODUCT,
      storage,
      expectedIssuer: ISSUER,
      fetchImpl,
    }),
    storage,
  };
}

describe('SDK client — activate + features guard (N9)', () => {
  it('returns features=[] when the token carries no features claim', async () => {
    const storage = createMemoryStorage();
    const { fetchImpl } = makeFetch({
      activate: async () =>
        json(200, {
          token: await signServerToken({ features: undefined }),
          expiresAt: new Date(Date.now() + 3600_000).toISOString(),
          recheckIntervalHours: 12,
          seats: [],
        }),
    });
    const { client } = makeClient(fetchImpl, storage);
    const result = await client.activate({ licenseKey: VALID_KEY });
    expect(result.features).toEqual([]);
    // And it must be safe to call array methods on it.
    expect(result.features.includes('pro')).toBe(false);
  });

  it('filters non-string entries out of the features claim', async () => {
    const storage = createMemoryStorage();
    const { fetchImpl } = makeFetch({
      activate: async () =>
        json(200, {
          token: await signServerToken({ features: ['voice', 42, null, 'pro'] }),
          expiresAt: new Date(Date.now() + 3600_000).toISOString(),
          recheckIntervalHours: 12,
          seats: [],
        }),
    });
    const { client } = makeClient(fetchImpl, storage);
    const result = await client.activate({ licenseKey: VALID_KEY });
    expect(result.features).toEqual(['voice', 'pro']);
  });
});

describe('SDK client — validate() grace machine (#5, #2, #8)', () => {
  async function seededClient(recheck: () => Promise<Response> | Response) {
    const storage = createMemoryStorage();
    const { fetchImpl, hits } = makeFetch({
      activate: async () =>
        json(200, {
          token: await signServerToken({ features: ['voice'], expSeconds: 3600 }),
          expiresAt: new Date(Date.now() + 3600_000).toISOString(),
          recheckIntervalHours: 0, // → validate() always attempts a recheck
          seats: [],
        }),
      recheck,
    });
    const { client } = makeClient(fetchImpl, storage);
    await client.activate({ licenseKey: VALID_KEY });
    return { client, hits, storage };
  }

  it('keeps using the cached token when recheck returns 500 within the exp window (grace)', async () => {
    const { client, hits } = await seededClient(() => json(500, { error: { code: 'internal_error' } }));
    const result = await client.validate();
    expect(hits.recheck).toBeGreaterThan(0); // recheck WAS attempted
    expect(result.features).toEqual(['voice']); // but cached token still serves
    expect(result.refreshedFromServer).toBe(false);
  });

  it('keeps using the cached token when recheck returns 429 within the exp window (#8 grace)', async () => {
    const { client } = await seededClient(() => json(429, { error: { code: 'rate_limited' } }));
    const result = await client.validate();
    expect(result.features).toEqual(['voice']);
    expect(result.refreshedFromServer).toBe(false);
  });

  it('surfaces a misconfiguration (unknown_product) as LicenseConfigError, not a license verdict', async () => {
    const { client } = await seededClient(() => json(404, { error: { code: 'unknown_product' } }));
    await expect(client.validate()).rejects.toBeInstanceOf(LicenseConfigError);
  });

  it('throws + clears state on a revoked signal', async () => {
    const { client, storage } = await seededClient(() => json(200, { status: 'revoked', revokedAt: null }));
    await expect(client.validate()).rejects.toBeInstanceOf(LicenseRevokedError);
    expect(await storage.get('license-state.v1')).toBeNull();
  });

  it('throws + clears state on an expired signal', async () => {
    const { client, storage } = await seededClient(() => json(200, { status: 'expired' }));
    await expect(client.validate()).rejects.toBeInstanceOf(LicenseExpiredError);
    expect(await storage.get('license-state.v1')).toBeNull();
  });

  it('throws BindingsReleasedError + clears state when all bindings were released', async () => {
    const { client, storage } = await seededClient(() =>
      json(403, { error: { code: 'bindings_released', message: 're-activate' } }),
    );
    await expect(client.validate()).rejects.toBeInstanceOf(BindingsReleasedError);
    expect(await storage.get('license-state.v1')).toBeNull();
  });

  it('clears state on a hard token_* recheck failure (#9 self-heal)', async () => {
    const { client, storage } = await seededClient(() =>
      json(401, { error: { code: 'token_signature_invalid', message: 'bad kid' } }),
    );
    await expect(client.validate()).rejects.toBeInstanceOf(LicenseTokenInvalidError);
    expect(await storage.get('license-state.v1')).toBeNull();
  });
});

describe('SDK client — corrupt lastRecheckAt forces a recheck (N8)', () => {
  it('attempts a recheck even with a non-recheck interval when lastRecheckAt is unparseable', async () => {
    const storage = createMemoryStorage();
    let rechecked = false;
    const { fetchImpl } = makeFetch({
      activate: async () =>
        json(200, {
          token: await signServerToken({ features: [] }),
          expiresAt: new Date(Date.now() + 3600_000).toISOString(),
          recheckIntervalHours: 12, // normally NO recheck for 12h
          seats: [],
        }),
      recheck: async () => {
        rechecked = true;
        return json(200, {
          status: 'active',
          token: await signServerToken({ features: ['voice'] }),
          expiresAt: new Date(Date.now() + 3600_000).toISOString(),
          recheckIntervalHours: 12,
          seats: [],
        });
      },
    });
    const { client } = makeClient(fetchImpl, storage);
    await client.activate({ licenseKey: VALID_KEY });

    // Corrupt the persisted lastRecheckAt → getTime() is NaN.
    const raw = JSON.parse((await storage.get('license-state.v1'))!);
    raw.lastRecheckAt = 'not-a-date';
    await storage.set('license-state.v1', JSON.stringify(raw));

    const result = await client.validate();
    expect(rechecked).toBe(true);
    // The rechecked token's claims (features:['voice']) replaced the activate
    // token's (features:[]), proving the forced recheck result was applied.
    expect(result.features).toEqual(['voice']);
  });
});
