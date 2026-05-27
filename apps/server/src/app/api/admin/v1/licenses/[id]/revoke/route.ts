import { NextResponse } from 'next/server';
import { authorizeAdminRoute, jsonError } from '@/lib/auth/admin-route-auth';
import {
  LicenseAlreadyRevokedError,
  LicenseNotFoundError,
  licenseRevokeSchema,
  revokeLicense,
} from '@/lib/services/license-service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(req: Request, { params }: RouteParams) {
  const auth = await authorizeAdminRoute(req, { requireScope: 'licenses:revoke' });
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, 'invalid_json', 'Request body must be valid JSON');
  }
  const parsed = licenseRevokeSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, 'validation_error', 'Invalid revoke payload', parsed.error.format());
  }

  try {
    const license = await revokeLicense(id, parsed.data.reason, auth);
    return NextResponse.json({ license });
  } catch (err) {
    if (err instanceof LicenseNotFoundError) {
      return jsonError(404, 'not_found', 'License not found');
    }
    if (err instanceof LicenseAlreadyRevokedError) {
      return jsonError(409, 'already_revoked', err.message);
    }
    throw err;
  }
}
