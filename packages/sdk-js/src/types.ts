/**
 * Public types for the License Engine SDK.
 *
 * These mirror what the server returns over the wire — keep them in sync
 * with the API contract. (A future iteration may move them into
 * `@license-engine/shared-types` once the API stabilizes.)
 */

export type BindingType = 'domain' | 'device' | 'account' | 'installation';

export interface BindingInput {
  type: BindingType;
  value: string;
  metadata?: Record<string, unknown>;
}

/** Server-side `/api/v1/activate` response. */
export interface ActivateResponse {
  token: string;
  expiresAt: string; // ISO timestamp
  recheckIntervalHours: number;
}

/** Server-side `/api/v1/recheck` response. */
export type RecheckResponse =
  | { status: 'active'; token: string; expiresAt: string; recheckIntervalHours: number }
  | { status: 'revoked'; revokedAt: string | null }
  | { status: 'expired' };

/** Single key entry from `/api/v1/.well-known/public-keys`. */
export interface PublicKeyEntry {
  kid: string;
  productId: string;
  productSlug: string;
  algorithm: 'Ed25519';
  publicKey: string; // SPKI PEM
  isActive: boolean;
  createdAt: string;
  rotatedAt: string | null;
}

/** Claims we expect inside a verified license JWT. */
export interface LicenseTokenClaims {
  sub: string; // license id
  aud: string; // product slug
  iss: string;
  iat: number;
  nbf: number;
  exp: number;
  jti: string;
  licenseKey: string;
  features: string[];
  bindings: Array<{ type: BindingType; hash: string }>;
}

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
