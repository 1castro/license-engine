import { prisma } from '../prisma';
import { getLogger } from '../logger';
import { hashApiKey, isValidApiKeyFormat } from './api-key';

export type ApiKeyScope =
  | 'products:read'
  | 'products:write'
  | 'customers:read'
  | 'customers:write'
  | 'licenses:read'
  | 'licenses:write'
  | 'licenses:revoke'
  | 'activations:read'
  | 'activations:write'
  | 'audit:read';

export const ALL_SCOPES: readonly ApiKeyScope[] = [
  'products:read',
  'products:write',
  'customers:read',
  'customers:write',
  'licenses:read',
  'licenses:write',
  'licenses:revoke',
  'activations:read',
  'activations:write',
  'audit:read',
];

/**
 * Scopes a LICENSE-BOUND API key may hold. A binding only constrains license-
 * and activation-level access to the key's own license (enforced per-route by
 * enforceLicenseAccess). Cross-tenant scopes (customers/products/audit, and
 * license create/write/revoke) are NOT meaningfully bindable — a "bound" key
 * with such a scope could still enumerate or mutate other tenants. They are
 * therefore refused at key-creation time for bound keys.
 */
export const LICENSE_BOUND_ALLOWED_SCOPES: readonly ApiKeyScope[] = [
  'licenses:read',
  'activations:read',
  'activations:write',
];

export interface ApiKeyContext {
  apiKeyId: string;
  apiKeyName: string;
  scopes: ApiKeyScope[];
  /** When set, the key is restricted to this single license (multi-tenant). */
  licenseId: string | null;
}

/**
 * Extracts the plaintext API key from the request, if any.
 * Looks at `Authorization: Bearer <key>` first, then `X-API-Key: <key>`.
 */
export function extractApiKeyPlaintext(req: Request | { headers: Headers }): string | null {
  const auth = req.headers.get('authorization');
  if (auth) {
    const match = auth.match(/^Bearer\s+(\S+)$/i);
    if (match?.[1]) return match[1];
  }
  const direct = req.headers.get('x-api-key');
  if (direct) return direct.trim();
  return null;
}

/**
 * Looks up the API key in the database, verifies it's not revoked,
 * updates `lastUsedAt`, and returns the context.
 *
 * Returns null for: missing key, malformed format, unknown hash, revoked key.
 * Never throws on auth failure — returns null and the caller decides how to
 * respond (typically 401).
 */
export async function authenticateApiKey(
  plaintext: string | null,
): Promise<ApiKeyContext | null> {
  const log = getLogger();
  if (!plaintext) return null;
  if (!isValidApiKeyFormat(plaintext)) {
    log.warn({ event: 'apikey.auth.malformed' }, 'Rejected API key with bad format');
    return null;
  }

  const hash = hashApiKey(plaintext);
  const row = await prisma.apiKey.findUnique({ where: { keyHash: hash } });
  if (!row) {
    log.warn({ event: 'apikey.auth.unknown' }, 'Rejected unknown API key hash');
    return null;
  }
  if (row.revokedAt) {
    log.warn({ event: 'apikey.auth.revoked', apiKeyId: row.id }, 'Rejected revoked API key');
    return null;
  }

  // Fire-and-forget lastUsedAt update — don't block the request on it.
  prisma.apiKey
    .update({ where: { id: row.id }, data: { lastUsedAt: new Date() } })
    .catch((err: unknown) => {
      log.warn(
        { err: err instanceof Error ? err.message : 'unknown', apiKeyId: row.id },
        'Failed to update apiKey.lastUsedAt',
      );
    });

  const scopes = parseScopes(row.scopes);

  return { apiKeyId: row.id, apiKeyName: row.name, scopes, licenseId: row.licenseId };
}

/** Parses the JSON-serialized scopes column into a typed array, dropping unknowns. */
function parseScopes(raw: unknown): ApiKeyScope[] {
  if (!Array.isArray(raw)) return [];
  const out: ApiKeyScope[] = [];
  for (const s of raw) {
    if (typeof s === 'string' && (ALL_SCOPES as readonly string[]).includes(s)) {
      out.push(s as ApiKeyScope);
    }
  }
  return out;
}

export function hasScope(ctx: ApiKeyContext | null, required: ApiKeyScope): boolean {
  return !!ctx && ctx.scopes.includes(required);
}
