import { NextResponse } from 'next/server';
import { authorizeAdminRoute, jsonError } from '@/lib/auth/admin-route-auth';
import {
  apiKeyCreateSchema,
  createApiKey,
  listApiKeys,
} from '@/lib/services/api-key-service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Tag 2: dedicated `apikeys:*` scopes are not yet defined; the admin UI session
// is the primary path. We reuse `products:read`/`products:write` so an existing
// admin-grade key can manage keys without inventing a scope we'd have to revisit.
const READ_SCOPE = 'products:read' as const;
const WRITE_SCOPE = 'products:write' as const;

export async function GET(req: Request) {
  const auth = await authorizeAdminRoute(req, { requireScope: READ_SCOPE });
  if (auth instanceof NextResponse) return auth;

  const apiKeys = await listApiKeys();
  return NextResponse.json({ apiKeys });
}

export async function POST(req: Request) {
  const auth = await authorizeAdminRoute(req, { requireScope: WRITE_SCOPE });
  if (auth instanceof NextResponse) return auth;

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

  const { apiKey, plaintext } = await createApiKey(parsed.data, auth);
  return NextResponse.json({ apiKey, plaintext }, { status: 201 });
}
