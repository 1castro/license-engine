import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { authorizeAdminRoute, jsonError } from '@/lib/auth/admin-route-auth';
import {
  createLicense,
  FeatureFlagsNotInCatalogError,
  getLicense,
  licenseCreateSchema,
  LicenseCustomerNotFoundError,
  licenseListFilterSchema,
  listLicenses,
  ProductNotFoundError,
} from '@/lib/services/license-service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: Request) {
  const auth = await authorizeAdminRoute(req, { requireScope: 'licenses:read' });
  if (auth instanceof NextResponse) return auth;

  // License-bound API key: scope the listing to its single license. We never
  // trust the client filter for isolation — a bound key must not enumerate the
  // full license set (multi-tenant isolation).
  if (auth.subject.kind === 'api_key' && auth.subject.licenseId !== null) {
    const license = await getLicense(auth.subject.licenseId);
    return NextResponse.json({ licenses: license ? [license] : [] });
  }

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

  // Defense-in-depth: creating a license is inherently un-scopeable to a single
  // license, so a license-bound key must never do it (it also can't normally
  // hold licenses:write — see LICENSE_BOUND_ALLOWED_SCOPES). Belt and braces.
  if (auth.subject.kind === 'api_key' && auth.subject.licenseId !== null) {
    return jsonError(403, 'forbidden', 'A license-bound key cannot create licenses');
  }

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
    if (err instanceof LicenseCustomerNotFoundError) {
      return jsonError(404, 'customer_not_found', err.message);
    }
    if (err instanceof FeatureFlagsNotInCatalogError) {
      return jsonError(400, 'feature_flags_not_in_catalog', err.message, {
        unknownFlags: err.unknownFlags,
      });
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
