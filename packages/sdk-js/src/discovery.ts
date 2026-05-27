import type { PublicKeyEntry, StorageAdapter } from './types';

const STORAGE_KEY = 'public-keys.v1';

interface CachedPublicKeys {
  fetchedAt: string;
  serverUrl: string;
  keys: PublicKeyEntry[];
}

export interface PublicKeysCacheStatus {
  keys: PublicKeyEntry[];
  fromCache: boolean;
  cacheAgeMs: number | null;
}

export class PublicKeysFetchError extends Error {
  constructor(public readonly status: number | null, message: string) {
    super(message);
    this.name = 'PublicKeysFetchError';
  }
}

export async function fetchPublicKeysFromServer(
  serverUrl: string,
  fetchImpl: typeof fetch,
  timeoutMs: number,
): Promise<PublicKeyEntry[]> {
  const url = `${serverUrl.replace(/\/$/, '')}/api/v1/.well-known/public-keys`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { signal: controller.signal });
    if (!res.ok) {
      throw new PublicKeysFetchError(res.status, `Failed to fetch public keys: HTTP ${res.status}`);
    }
    const body = (await res.json()) as { keys?: PublicKeyEntry[] };
    if (!body.keys || !Array.isArray(body.keys)) {
      throw new PublicKeysFetchError(res.status, 'Public-keys response missing "keys" array');
    }
    return body.keys;
  } catch (err) {
    if (err instanceof PublicKeysFetchError) throw err;
    throw new PublicKeysFetchError(null, err instanceof Error ? err.message : 'unknown');
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Loads the cached public-key set if it's younger than `maxAgeMs`,
 * otherwise fetches from server, persists, and returns.
 *
 * If a fresh server fetch fails but a cached set exists, returns the cached
 * set with `fromCache=true`. If neither cache nor server is available,
 * throws PublicKeysFetchError.
 */
export async function loadPublicKeys(input: {
  serverUrl: string;
  storage: StorageAdapter;
  fetchImpl: typeof fetch;
  maxAgeMs: number;
  timeoutMs: number;
}): Promise<PublicKeysCacheStatus> {
  const raw = await input.storage.get(STORAGE_KEY);
  let cached: CachedPublicKeys | null = null;
  if (raw) {
    try {
      cached = JSON.parse(raw) as CachedPublicKeys;
    } catch {
      cached = null;
    }
  }
  const now = Date.now();
  if (cached && cached.serverUrl === input.serverUrl) {
    const ageMs = now - new Date(cached.fetchedAt).getTime();
    if (ageMs < input.maxAgeMs) {
      return { keys: cached.keys, fromCache: true, cacheAgeMs: ageMs };
    }
  }

  try {
    const keys = await fetchPublicKeysFromServer(input.serverUrl, input.fetchImpl, input.timeoutMs);
    const payload: CachedPublicKeys = {
      fetchedAt: new Date(now).toISOString(),
      serverUrl: input.serverUrl,
      keys,
    };
    await input.storage.set(STORAGE_KEY, JSON.stringify(payload));
    return { keys, fromCache: false, cacheAgeMs: 0 };
  } catch (err) {
    // Server unreachable but we have something cached — fall back.
    if (cached && cached.serverUrl === input.serverUrl) {
      return {
        keys: cached.keys,
        fromCache: true,
        cacheAgeMs: now - new Date(cached.fetchedAt).getTime(),
      };
    }
    throw err;
  }
}
