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
  | { kind: 'api_key'; apiKeyId: string; apiKeyName: string; scopes: ApiKeyScope[] };

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
      },
    };
  }

  return jsonError(401, 'unauthorized', 'Authentication required');
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

