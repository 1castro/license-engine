import { NextResponse } from 'next/server';
import { authorizeAdminRoute, enforceLicenseAccess, jsonError } from '@/lib/auth/admin-route-auth';
import {
  LicenseNotFoundError,
  LicenseStateTransitionError,
  reactivateLicense,
} from '@/lib/services/license-service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** Resume a paused license (suspended → active). Held seats stay active. */
export async function POST(req: Request, { params }: RouteParams) {
  const auth = await authorizeAdminRoute(req, { requireScope: 'licenses:write' });
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  const denied = enforceLicenseAccess(auth, id);
  if (denied) return denied;

  try {
    const license = await reactivateLicense(id, auth);
    return NextResponse.json({ license });
  } catch (err) {
    if (err instanceof LicenseNotFoundError) {
      return jsonError(404, 'not_found', 'License not found');
    }
    if (err instanceof LicenseStateTransitionError) {
      // Only a suspended license can be reactivated.
      return jsonError(409, 'invalid_state', err.message);
    }
    throw err;
  }
}
