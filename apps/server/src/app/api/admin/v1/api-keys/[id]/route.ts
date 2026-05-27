import { NextResponse } from 'next/server';
import { authorizeAdminRoute, jsonError } from '@/lib/auth/admin-route-auth';
import {
  ApiKeyAlreadyRevokedError,
  ApiKeyNotFoundError,
  revokeApiKey,
} from '@/lib/services/api-key-service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// "Delete" semantics: API keys are never hard-deleted — DELETE revokes them so
// that audit and lastUsedAt traces remain available.
export async function DELETE(req: Request, { params }: RouteParams) {
  const auth = await authorizeAdminRoute(req, { requireScope: 'products:write' });
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;

  try {
    const apiKey = await revokeApiKey(id, auth);
    return NextResponse.json({ apiKey });
  } catch (err) {
    if (err instanceof ApiKeyNotFoundError) {
      return jsonError(404, 'not_found', 'API key not found');
    }
    if (err instanceof ApiKeyAlreadyRevokedError) {
      return jsonError(409, 'already_revoked', err.message);
    }
    throw err;
  }
}
