import { NextResponse } from 'next/server';
import { authorizeAdminRoute, enforceLicenseAccess, jsonError } from '@/lib/auth/admin-route-auth';
import {
  LicenseNotFoundError,
  LicenseStateTransitionError,
  licenseSuspendSchema,
  suspendLicense,
} from '@/lib/services/license-service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** Pause a license (active → suspended). Reversible; seats are held. */
export async function POST(req: Request, { params }: RouteParams) {
  const auth = await authorizeAdminRoute(req, { requireScope: 'licenses:write' });
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  const denied = enforceLicenseAccess(auth, id);
  if (denied) return denied;

  // Body is optional (reason may be omitted) — tolerate an empty body.
  let body: unknown = {};
  try {
    const text = await req.text();
    if (text.length > 32 * 1024) {
      return jsonError(413, 'payload_too_large', 'Request body too large');
    }
    if (text.trim().length > 0) body = JSON.parse(text);
  } catch {
    return jsonError(400, 'invalid_json', 'Request body must be valid JSON');
  }
  const parsed = licenseSuspendSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, 'validation_error', 'Invalid suspend payload', parsed.error.format());
  }

  try {
    const license = await suspendLicense(id, parsed.data.reason, auth);
    return NextResponse.json({ license });
  } catch (err) {
    if (err instanceof LicenseNotFoundError) {
      return jsonError(404, 'not_found', 'License not found');
    }
    if (err instanceof LicenseStateTransitionError) {
      // Only an active license can be paused (not revoked/expired/already-paused).
      return jsonError(409, 'invalid_state', err.message);
    }
    throw err;
  }
}
