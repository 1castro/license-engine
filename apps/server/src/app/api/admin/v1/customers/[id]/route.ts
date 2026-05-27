import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { authorizeAdminRoute, jsonError } from '@/lib/auth/admin-route-auth';
import {
  CustomerHasLicensesError,
  customerUpdateSchema,
  deleteCustomer,
  getCustomer,
  updateCustomer,
} from '@/lib/services/customer-service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(req: Request, { params }: RouteParams) {
  const auth = await authorizeAdminRoute(req, { requireScope: 'customers:read' });
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;

  const customer = await getCustomer(id);
  if (!customer) return jsonError(404, 'not_found', 'Customer not found');
  return NextResponse.json({ customer });
}

export async function PATCH(req: Request, { params }: RouteParams) {
  const auth = await authorizeAdminRoute(req, { requireScope: 'customers:write' });
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, 'invalid_json', 'Request body must be valid JSON');
  }
  const parsed = customerUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, 'validation_error', 'Invalid customer payload', parsed.error.format());
  }

  try {
    const customer = await updateCustomer(id, parsed.data, auth);
    return NextResponse.json({ customer });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === 'P2025') return jsonError(404, 'not_found', 'Customer not found');
      if (err.code === 'P2002') {
        return jsonError(
          409,
          'conflict',
          'A customer with this external reference already exists for the given source',
        );
      }
    }
    throw err;
  }
}

export async function DELETE(req: Request, { params }: RouteParams) {
  const auth = await authorizeAdminRoute(req, { requireScope: 'customers:write' });
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;

  try {
    await deleteCustomer(id, auth);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    if (err instanceof CustomerHasLicensesError) {
      return jsonError(409, 'customer_has_licenses', err.message, {
        licenseCount: err.licenseCount,
      });
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      return jsonError(404, 'not_found', 'Customer not found');
    }
    throw err;
  }
}
