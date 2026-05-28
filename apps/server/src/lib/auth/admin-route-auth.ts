import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from './config';
import {
  authenticateApiKey,
  extractApiKeyPlaintext,
  type ApiKeyScope,
} from './api-key-middleware';
import { extractIp } from '../audit';

export type AdminAuthSubject =
  | { kind: 'admin'; userId: string; email: string; role: string }
  | {
      kind: 'api_key';
      apiKeyId: string;
      apiKeyName: string;
      scopes: ApiKeyScope[];
      /** When set, the key may only act on this single license. */
      licenseId: string | null;
    };

export interface AdminAuthContext {
  subject: AdminAuthSubject;
  ip: string | null;
}

export interface AdminAuthOptions {
  /** Required API-key scope. Session-authenticated admins bypass this check. */
  requireScope?: ApiKeyScope;
}

/**
 * Authenticates an admin-API request via session OR API key.
 *
 * Resolution order:
 *   1. NextAuth session (set by the admin UI after login).
 *   2. API key (Authorization: Bearer … or X-API-Key: …).
 *
 * Returns either an `AdminAuthContext` or a NextResponse with 401/403.
 * Callers `if (auth instanceof NextResponse) return auth;` and otherwise use `auth.subject`.
 */
export async function authorizeAdminRoute(
  req: Request,
  options: AdminAuthOptions = {},
): Promise<AdminAuthContext | NextResponse> {
  const ip = extractIp(req);

  // 1. Session check (UI calls)
  const session = await getServerSession(authOptions);
  if (session?.user) {
    const userId = (session.user as { id?: string }).id ?? '';
    const role = (session.user as { role?: string }).role ?? 'unknown';
    return {
      ip,
      subject: { kind: 'admin', userId, email: session.user.email ?? '', role },
    };
  }

  // 2. API-key check (service-to-service calls)
  const plaintext = extractApiKeyPlaintext(req);
  const apiKey = await authenticateApiKey(plaintext);
  if (apiKey) {
    if (options.requireScope && !apiKey.scopes.includes(options.requireScope)) {
      return jsonError(403, 'forbidden', `Missing required scope: ${options.requireScope}`);
    }
    return {
      ip,
      subject: {
        kind: 'api_key',
        apiKeyId: apiKey.apiKeyId,
        apiKeyName: apiKey.apiKeyName,
        scopes: apiKey.scopes,
        licenseId: apiKey.licenseId,
      },
    };
  }

  return jsonError(401, 'unauthorized', 'Authentication required');
}

/**
 * Enforces the API key's license binding. If the caller is a license-bound
 * API key and the requested license is a different one, returns a 404 (we hide
 * existence rather than 403). Admin sessions and unbound keys pass through.
 * Returns null when access is allowed.
 */
export function enforceLicenseAccess(
  ctx: AdminAuthContext,
  licenseId: string,
): NextResponse | null {
  if (ctx.subject.kind === 'api_key' && ctx.subject.licenseId !== null) {
    if (ctx.subject.licenseId !== licenseId) {
      return jsonError(404, 'not_found', 'License not found');
    }
  }
  return null;
}

/**
 * Restricts a route to interactive admin sessions — API-key actors are rejected.
 * Use for self-administration endpoints (e.g. API-key management) so that a
 * service key can never create or revoke keys and thereby escalate its own scope
 * or shed its license binding.
 */
export function requireAdminSession(ctx: AdminAuthContext): NextResponse | null {
  if (ctx.subject.kind !== 'admin') {
    return jsonError(403, 'forbidden', 'Only an admin session may perform this action');
  }
  return null;
}

export function jsonError(
  status: number,
  code: string,
  message: string,
  details?: unknown,
): NextResponse {
  return NextResponse.json({ error: { code, message, details } }, { status });
}

/** Resolves the actor type + id for AuditLog calls from an AdminAuthContext. */
export function actorOf(ctx: AdminAuthContext): { actorType: 'admin' | 'api_key'; actorId: string } {
  return ctx.subject.kind === 'admin'
    ? { actorType: 'admin', actorId: ctx.subject.userId }
    : { actorType: 'api_key', actorId: ctx.subject.apiKeyId };
}

