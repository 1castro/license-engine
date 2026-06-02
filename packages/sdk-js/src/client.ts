import { loadPublicKeys, PublicKeysFetchError } from './discovery';
import { verifyLicenseToken } from './verify';
import { normalizeLicenseKey, validateLicenseKey } from './license-key';
import {
  BindingMismatchError,
  BindingsReleasedError,
  LicenseConfigError,
  LicenseExpiredError,
  LicenseInvalidKeyError,
  LicenseNotActiveError,
  LicenseRevokedError,
  LicenseTokenInvalidError,
  ServerUnreachableError,
} from './errors';
import type {
  ActivateResponse,
  BindingInput,
  LicenseClientConfig,
  RecheckResponse,
  ValidatedLicense,
} from './types';

const STATE_KEY = 'license-state.v1';
const DEFAULT_PUBLIC_KEYS_REFRESH_MS = 24 * 60 * 60 * 1000;
const DEFAULT_FETCH_TIMEOUT_MS = 10_000;

interface PersistedState {
  licenseKey: string;
  productSlug: string;
  token: string;
  expiresAt: string;
  recheckIntervalHours: number;
  lastRecheckAt: string;
  bindings: BindingInput[];
}

export interface LicenseClient {
  /** Performs the initial server activation and persists the resulting token. */
  activate(input: { licenseKey: string; bindings?: BindingInput[] }): Promise<ValidatedLicense>;
  /**
   * Validates the cached license. Triggers an opportunistic recheck if the
   * recheck interval has elapsed; falls back to a verified-but-stale token
   * inside its exp window if the server is unreachable.
   */
  validate(): Promise<ValidatedLicense>;
  /** Forces a server-side recheck right now. */
  recheck(): Promise<ValidatedLicense>;
  /** Releases one binding from the activation. The cached token stays. */
  deactivate(binding: { type: BindingInput['type']; value: string }): Promise<{ released: boolean }>;
  /** Clears all locally-cached license state (token, keys, bindings). */
  clear(): Promise<void>;
}

/**
 * Defensively coerces the token's `features` claim to a string[]. The payload
 * is cast from JWT without runtime validation, so a token lacking the claim (or
 * carrying a non-array) would otherwise yield `undefined` and crash the
 * integrating app the moment it calls `.includes()`/`.map()` on it.
 */
function readFeatures(claims: { features?: unknown }): string[] {
  return Array.isArray(claims.features)
    ? claims.features.filter((f): f is string => typeof f === 'string')
    : [];
}

export function createLicenseClient(config: LicenseClientConfig): LicenseClient {
  const fetchImpl = config.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const publicKeysRefreshMs = config.publicKeysRefreshMs ?? DEFAULT_PUBLIC_KEYS_REFRESH_MS;
  const fetchTimeoutMs = config.fetchTimeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS;
  const serverUrl = config.serverUrl.replace(/\/$/, '');

  async function loadState(): Promise<PersistedState | null> {
    const raw = await config.storage.get(STATE_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as PersistedState;
    } catch {
      return null;
    }
  }
  async function saveState(state: PersistedState): Promise<void> {
    await config.storage.set(STATE_KEY, JSON.stringify(state));
  }
  async function clearState(): Promise<void> {
    await config.storage.delete(STATE_KEY);
  }

  async function postWithTimeout(url: string, body: unknown): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), fetchTimeoutMs);
    try {
      return await fetchImpl(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  }

  async function verifyToken(token: string): Promise<{
    claims: import('./types').LicenseTokenClaims;
    fromCache: boolean;
  }> {
    let publicKeys;
    try {
      publicKeys = await loadPublicKeys({
        serverUrl,
        storage: config.storage,
        fetchImpl,
        maxAgeMs: publicKeysRefreshMs,
        timeoutMs: fetchTimeoutMs,
      });
    } catch (err) {
      // We can't fetch keys AND don't have a cache — token cannot be verified.
      throw new ServerUnreachableError(
        err instanceof PublicKeysFetchError ? err.message : 'unknown',
        false,
      );
    }
    const claims = await verifyLicenseToken({
      token,
      publicKeys: publicKeys.keys,
      expectedProductSlug: config.productSlug,
      expectedIssuer: config.expectedIssuer,
    });
    return { claims, fromCache: publicKeys.fromCache };
  }

  async function activate(input: { licenseKey: string; bindings?: BindingInput[] }): Promise<ValidatedLicense> {
    const validation = validateLicenseKey(input.licenseKey);
    if (!validation.valid) {
      throw new LicenseInvalidKeyError(validation.reason);
    }
    const canonicalKey = validation.canonical;
    const bindings = input.bindings ?? config.bindingOverrides ?? [];

    let res: Response;
    try {
      res = await postWithTimeout(`${serverUrl}/api/v1/activate`, {
        licenseKey: canonicalKey,
        productSlug: config.productSlug,
        bindings,
      });
    } catch (err) {
      throw new ServerUnreachableError(err instanceof Error ? err.message : 'unknown', false);
    }

    if (!res.ok) {
      await mapHttpError(res, 'activate');
    }
    const body = (await res.json()) as ActivateResponse;
    const state: PersistedState = {
      licenseKey: canonicalKey,
      productSlug: config.productSlug,
      token: body.token,
      expiresAt: body.expiresAt,
      recheckIntervalHours: body.recheckIntervalHours,
      lastRecheckAt: new Date().toISOString(),
      bindings,
    };
    await saveState(state);

    const { claims } = await verifyToken(body.token);
    return {
      licenseKey: canonicalKey,
      productSlug: config.productSlug,
      features: readFeatures(claims),
      expiresAt: new Date(body.expiresAt),
      token: body.token,
      refreshedFromServer: true,
    };
  }

  async function performRecheck(state: PersistedState): Promise<PersistedState> {
    let res: Response;
    try {
      res = await postWithTimeout(`${serverUrl}/api/v1/recheck`, {
        token: state.token,
        productSlug: config.productSlug,
      });
    } catch (err) {
      throw new ServerUnreachableError(
        err instanceof Error ? err.message : 'unknown',
        new Date(state.expiresAt).getTime() > Date.now(),
        new Date(state.expiresAt),
      );
    }
    if (!res.ok) {
      try {
        await mapHttpError(res, 'recheck', state.expiresAt);
      } catch (err) {
        // The license is fine but every binding on this token was released
        // (seat freed centrally). Drop the stale cache so the app re-activates.
        if (err instanceof BindingsReleasedError) await clearState();
        // The cached token is permanently unusable for verification (e.g. its
        // kid no longer verifies after key rotation → token_signature_invalid,
        // or token_expired/_malformed). Re-presenting it will fail forever, so
        // drop it; the only recovery is a fresh activate(). Without this the
        // client loops on the same hard error and never self-heals.
        if (err instanceof LicenseTokenInvalidError) await clearState();
        throw err;
      }
    }
    const body = (await res.json()) as RecheckResponse;
    if (body.status === 'revoked') {
      await clearState();
      throw new LicenseRevokedError(body.revokedAt ? new Date(body.revokedAt) : null);
    }
    if (body.status === 'expired') {
      await clearState();
      throw new LicenseExpiredError(new Date(state.expiresAt));
    }
    const next: PersistedState = {
      ...state,
      token: body.token,
      expiresAt: body.expiresAt,
      lastRecheckAt: new Date().toISOString(),
      // Server is allowed to change recheckIntervalHours per-product over time;
      // persist whatever it just told us so the next interval calculation uses it.
      recheckIntervalHours: body.recheckIntervalHours,
    };
    await saveState(next);
    return next;
  }

  async function recheck(): Promise<ValidatedLicense> {
    const state = await loadState();
    if (!state) throw new LicenseNotActiveError('No cached activation — call activate() first.');
    const next = await performRecheck(state);
    const { claims } = await verifyToken(next.token);
    return {
      licenseKey: next.licenseKey,
      productSlug: next.productSlug,
      features: readFeatures(claims),
      expiresAt: new Date(next.expiresAt),
      token: next.token,
      refreshedFromServer: true,
    };
  }

  async function validate(): Promise<ValidatedLicense> {
    const state = await loadState();
    if (!state) throw new LicenseNotActiveError('No cached activation — call activate() first.');
    if (state.productSlug !== config.productSlug) {
      throw new BindingMismatchError(
        `Cached state is for product "${state.productSlug}" but this client is configured for "${config.productSlug}"`,
      );
    }

    // First: cryptographically verify the cached token against cached public keys.
    let claims;
    let usedCachedKeys: boolean;
    try {
      const result = await verifyToken(state.token);
      claims = result.claims;
      usedCachedKeys = result.fromCache;
    } catch (err) {
      if (err instanceof LicenseTokenInvalidError && err.code === 'expired') {
        throw new LicenseExpiredError(new Date(state.expiresAt));
      }
      throw err;
    }

    // Second: if the recheck interval has elapsed, try a server roundtrip.
    // Guard against a corrupt/unparseable lastRecheckAt (storage corruption,
    // older schema, manual tampering): getTime() → NaN, and `Date.now() >= NaN`
    // is always false, which would silently disable rechecks forever and let a
    // revoked token validate offline until exp. Treat NaN as "overdue" so we
    // force a server roundtrip instead.
    const lastRecheckMs = new Date(state.lastRecheckAt).getTime();
    const nextRecheckAt = Number.isNaN(lastRecheckMs)
      ? Number.NEGATIVE_INFINITY
      : lastRecheckMs + state.recheckIntervalHours * 3600 * 1000;
    let currentState = state;
    let refreshed = false;
    if (Date.now() >= nextRecheckAt) {
      try {
        currentState = await performRecheck(state);
        refreshed = true;
        const v = await verifyToken(currentState.token);
        claims = v.claims;
      } catch (err) {
        if (err instanceof ServerUnreachableError) {
          // Cached token still inside its exp window? → keep going, surface a soft signal.
          if (!err.withinGracePeriod) throw err;
        } else {
          throw err;
        }
      }
    }

    return {
      licenseKey: currentState.licenseKey,
      productSlug: currentState.productSlug,
      features: readFeatures(claims),
      expiresAt: new Date(currentState.expiresAt),
      token: currentState.token,
      refreshedFromServer: refreshed && !usedCachedKeys,
    };
  }

  async function deactivate(binding: {
    type: BindingInput['type'];
    value: string;
  }): Promise<{ released: boolean }> {
    const state = await loadState();
    if (!state) throw new LicenseNotActiveError('No cached activation to deactivate.');
    let res: Response;
    try {
      res = await postWithTimeout(`${serverUrl}/api/v1/deactivate`, {
        token: state.token,
        productSlug: config.productSlug,
        bindingType: binding.type,
        bindingValue: binding.value,
      });
    } catch (err) {
      throw new ServerUnreachableError(
        err instanceof Error ? err.message : 'unknown',
        new Date(state.expiresAt).getTime() > Date.now(),
        new Date(state.expiresAt),
      );
    }
    if (!res.ok) {
      await mapHttpError(res, 'deactivate', state.expiresAt);
    }
    return (await res.json()) as { released: boolean };
  }

  async function clear(): Promise<void> {
    await clearState();
  }

  return { activate, validate, recheck, deactivate, clear };
}

async function mapHttpError(res: Response, op: string, graceExpiresAt?: string): Promise<never> {
  let body: { error?: { code?: string; message?: string } } = {};
  try {
    body = (await res.json()) as typeof body;
  } catch {
    // ignored
  }
  const code = body.error?.code ?? `http_${res.status}`;
  const message = body.error?.message ?? `Request failed with status ${res.status}`;

  // A 5xx is a server-side failure, not a license verdict. Treat it like
  // unreachability so the cached token's grace window applies — otherwise a
  // transient 500 would surface as LicenseNotActiveError and hard-block a paying
  // user whose license is actually fine. Grace info is known on recheck/
  // deactivate (we hold the cached token's expiry); activate has no prior token.
  if (res.status >= 500) {
    const within = graceExpiresAt ? new Date(graceExpiresAt).getTime() > Date.now() : false;
    throw new ServerUnreachableError(
      `Server error during ${op} (HTTP ${res.status}): ${message}`,
      within,
      graceExpiresAt ? new Date(graceExpiresAt) : undefined,
    );
  }

  if (code === 'invalid_license_key') throw new LicenseInvalidKeyError(message);
  if (code === 'bindings_released') throw new BindingsReleasedError(message);
  if (code === 'license_not_active') throw new LicenseNotActiveError(message);
  // Integration/config errors — the SDK is set up wrong or sent a bad payload.
  // Distinct from a license verdict so a misconfiguration doesn't masquerade
  // as "license inactive".
  if (code === 'unknown_product' || code === 'validation_error' || code === 'invalid_json') {
    throw new LicenseConfigError(code, message);
  }
  if (code.startsWith('binding_')) throw new BindingMismatchError(message);
  if (code === 'rate_limited') {
    // A 429 is a transient throttle (e.g. a NAT exhausting the per-IP limit),
    // not a license verdict — apply the same grace as a network error so a
    // still-valid cached token isn't discarded over a temporary block.
    const within = graceExpiresAt ? new Date(graceExpiresAt).getTime() > Date.now() : false;
    throw new ServerUnreachableError(
      `Rate-limited during ${op}: ${message}`,
      within,
      graceExpiresAt ? new Date(graceExpiresAt) : undefined,
    );
  }
  if (code.startsWith('token_')) throw new LicenseTokenInvalidError(code, message);

  throw new LicenseNotActiveError(`${op} failed: ${message}`);
}

export { normalizeLicenseKey, validateLicenseKey };
