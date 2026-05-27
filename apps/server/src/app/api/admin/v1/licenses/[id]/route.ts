import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { authorizeAdminRoute, jsonError } from '@/lib/auth/admin-route-auth';
import {
  getLicense,
  licenseUpdateSchema,
  updateLicense,
} from '@/lib/services/license-service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(req: Request, { params }: RouteParams) {
  const auth = await authorizeAdminRoute(req, { requireScope: 'licenses:read' });
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;

  const license = await getLicense(id);
  if (!license) return jsonError(404, 'not_found', 'License not found');
  return NextResponse.json({ license });
}

export async function PATCH(req: Request, { params }: RouteParams) {
  const auth = await authorizeAdminRoute(req, { requireScope: 'licenses:write' });
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, 'invalid_json', 'Request body must be valid JSON');
  }
  const parsed = licenseUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, 'validation_error', 'Invalid license payload', parsed.error.format());
  }

  try {
    const license = await updateLicense(id, parsed.data, auth);
    return NextResponse.json({ license });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      return jsonError(404, 'not_found', 'License not found');
    }
    throw err;
  }
}
