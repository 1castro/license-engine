import { NextResponse } from 'next/server';
import { authorizeAdminRoute, jsonError, requireAdminSession } from '@/lib/auth/admin-route-auth';
import {
  ApiKeyLicenseNotFoundError,
  ApiKeyScopeNotBindableError,
  apiKeyCreateSchema,
  createApiKey,
  listApiKeys,
} from '@/lib/services/api-key-service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// API-key management is admin-session-only: a service key must never be able to
// list, create or revoke keys (which would let it mint an unbound, higher-scoped
// key and escalate past its own license binding). Enforced via requireAdminSession.

export async function GET(req: Request) {
  const auth = await authorizeAdminRoute(req);
  if (auth instanceof NextResponse) return auth;
  const denied = requireAdminSession(auth);
  if (denied) return denied;

  const apiKeys = await listApiKeys();
  return NextResponse.json({ apiKeys });
}

export async function POST(req: Request) {
  const auth = await authorizeAdminRoute(req);
  if (auth instanceof NextResponse) return auth;
  const denied = requireAdminSession(auth);
  if (denied) return denied;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, 'invalid_json', 'Request body must be valid JSON');
  }
  const parsed = apiKeyCreateSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, 'validation_error', 'Invalid api-key payload', parsed.error.format());
  }

  try {
    const { apiKey, plaintext } = await createApiKey(parsed.data, auth);
    return NextResponse.json({ apiKey, plaintext }, { status: 201 });
  } catch (err) {
    if (err instanceof ApiKeyLicenseNotFoundError) {
      return jsonError(400, 'license_not_found', 'licenseId references a non-existent license');
    }
    if (err instanceof ApiKeyScopeNotBindableError) {
      return jsonError(400, 'scope_not_bindable', err.message, {
        disallowedScopes: err.disallowedScopes,
      });
    }
    throw err;
  }
}
