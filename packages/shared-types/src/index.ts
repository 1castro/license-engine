/**
 * Shared wire types — the single source of truth for the data that crosses the
 * License-Engine HTTP API between the server and any client (JS-SDK today, more
 * apps later). Server response builders and the SDK both import these so a
 * field change on one side can never silently diverge from the other.
 *
 * What belongs here: the over-the-wire shape (request/response bodies, JWT
 * claims, public-key entries). What does NOT: server-internal types (Prisma
 * models, jose specifics) and SDK-internal types (storage adapter, client
 * config) — those stay in their own package.
 */

export const SHARED_TYPES_VERSION = '0.1.0' as const;

/**
 * The binding kinds a license policy can use. Mirrors the server's Prisma
 * `BindingType` enum value-for-value (the enum values are exactly these
 * strings), so server code holding a Prisma `BindingType` can assign it to a
 * shared wire type and vice versa.
 */
export type BindingType = 'domain' | 'device' | 'account' | 'installation';

/** A binding the client presents at activation time. */
export interface BindingInput {
  type: BindingType;
  value: string;
  metadata?: Record<string, unknown>;
}

/** Seat usage per binding type (e.g. "37 of 100 account seats used"). */
export interface SeatInfo {
  type: BindingType;
  /** Currently active activations of this type. */
  used: number;
  /** Configured cap, or null if unlimited. */
  max: number | null;
}

/** Server-side `POST /api/v1/activate` response. */
export interface ActivateResponse {
  token: string;
  expiresAt: string; // ISO timestamp
  recheckIntervalHours: number;
  /** Seat usage for the binding types governed by the license policy. */
  seats?: SeatInfo[];
}

/** Server-side `POST /api/v1/recheck` response. */
export type RecheckResponse =
  | {
      status: 'active';
      token: string;
      expiresAt: string;
      recheckIntervalHours: number;
      seats?: SeatInfo[];
    }
  | { status: 'revoked'; revokedAt: string | null }
  | { status: 'expired' };

/** Single key entry from `GET /api/v1/.well-known/public-keys`. */
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

/** A binding carried inside a license token (hashed, never the raw value). */
export interface LicenseTokenBinding {
  type: BindingType;
  hash: string;
}

/**
 * Claims inside a verified license JWT. The server signs/verifies these via
 * jose (where they additionally satisfy `JWTPayload`); the SDK reads them after
 * offline verification. This is the wire contract both sides agree on.
 */
export interface LicenseTokenClaims {
  /** License.id */
  sub: string;
  /** Product.slug */
  aud: string;
  /** Issuer from env */
  iss: string;
  iat: number;
  nbf: number;
  exp: number;
  jti: string;
  /** End-user license key for client-side display only. */
  licenseKey: string;
  /** Active feature flags for this license. */
  features: string[];
  /** Bindings the client successfully passed at activation time, hashed. */
  bindings: LicenseTokenBinding[];
}
