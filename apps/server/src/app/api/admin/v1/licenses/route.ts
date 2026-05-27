import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { authorizeAdminRoute, jsonError } from '@/lib/auth/admin-route-auth';
import {
  createLicense,
  licenseCreateSchema,
  licenseListFilterSchema,
  listLicenses,
  ProductNotFoundError,
} from '@/lib/services/license-service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: Request) {
  const auth = await authorizeAdminRoute(req, { requireScope: 'licenses:read' });
  if (auth instanceof NextResponse) return auth;

  const url = new URL(req.url);
  const filterCandidate = {
    customerId: url.searchParams.get('customerId') ?? undefined,
    productId: url.searchParams.get('productId') ?? undefined,
    status: url.searchParams.get('status') ?? undefined,
  };
  const parsed = licenseListFilterSchema.safeParse(filterCandidate);
  if (!parsed.success) {
    return jsonError(400, 'validation_error', 'Invalid filter', parsed.error.format());
  }

  const licenses = await listLicenses(parsed.data);
  return NextResponse.json({ licenses });
}

export async function POST(req: Request) {
  const auth = await authorizeAdminRoute(req, { requireScope: 'licenses:write' });
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, 'invalid_json', 'Request body must be valid JSON');
  }
  const parsed = licenseCreateSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, 'validation_error', 'Invalid license payload', parsed.error.format());
  }

  try {
    const { license, created } = await createLicense(parsed.data, auth);
    return NextResponse.json({ license }, { status: created ? 201 : 200 });
  } catch (err) {
    if (err instanceof ProductNotFoundError) {
      return jsonError(404, 'product_not_found', err.message);
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === 'P2002') {
        return jsonError(
          409,
          'conflict',
          'A license with this external reference already exists for the given source',
        );
      }
      if (err.code === 'P2003') {
        return jsonError(
          400,
          'foreign_key_violation',
          'customerId or productId references a non-existent record',
        );
      }
    }
    throw err;
  }
}
