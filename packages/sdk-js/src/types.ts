/**
 * SDK types.
 *
 * The over-the-wire types (what the server returns / the JWT claims) live in
 * `@license-engine/shared-types` — the single source of truth shared with the
 * server. We re-export them here so existing `./types` imports keep working.
 * Only genuinely SDK-internal types (storage, client config, the validate()
 * result) are defined locally.
 */

export type {
  BindingType,
  BindingInput,
  SeatInfo,
  ActivateResponse,
  RecheckResponse,
  PublicKeyEntry,
  LicenseTokenBinding,
  LicenseTokenClaims,
} from '@license-engine/shared-types';

import type { BindingInput } from '@license-engine/shared-types';

/** Configuration handed to `createLicenseClient`. */
export interface LicenseClientConfig {
  /** Base URL of the License Engine, no trailing slash. */
  serverUrl: string;
  /** The slug of the product this client validates against. */
  productSlug: string;
  /** Storage adapter (in-memory by default for testing — use FS/IDB in real apps). */
  storage: StorageAdapter;
  /** Optional explicit issuer for token verification. Defaults to whatever the server set. */
  expectedIssuer?: string;
  /** Fetch implementation. Defaults to global `fetch`. */
  fetchImpl?: typeof fetch;
  /** Override the auto-detected installation id (Node) or domain (browser). */
  bindingOverrides?: BindingInput[];
  /** How often (ms) to fetch fresh public keys. Default 24h. */
  publicKeysRefreshMs?: number;
  /** Network timeout for server calls, ms. Default 10s. */
  fetchTimeoutMs?: number;
}

/** A storage adapter — three async string-to-string ops. */
export interface StorageAdapter {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

/** What the SDK exposes after `validate()` succeeds. */
export interface ValidatedLicense {
  licenseKey: string;
  productSlug: string;
  features: string[];
  expiresAt: Date;
  /** Cached token; the caller may forward this to e.g. SSR backends. */
  token: string;
  /** True if we just refreshed the token from the server in this call. */
  refreshedFromServer: boolean;
}
