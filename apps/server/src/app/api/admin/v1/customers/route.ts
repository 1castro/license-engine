import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { authorizeAdminRoute, jsonError } from '@/lib/auth/admin-route-auth';
import {
  createCustomer,
  customerCreateSchema,
  listCustomers,
} from '@/lib/services/customer-service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: Request) {
  const auth = await authorizeAdminRoute(req, { requireScope: 'customers:read' });
  if (auth instanceof NextResponse) return auth;

  const customers = await listCustomers();
  return NextResponse.json({ customers });
}

export async function POST(req: Request) {
  const auth = await authorizeAdminRoute(req, { requireScope: 'customers:write' });
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, 'invalid_json', 'Request body must be valid JSON');
  }
  const parsed = customerCreateSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, 'validation_error', 'Invalid customer payload', parsed.error.format());
  }

  try {
    const { customer, created } = await createCustomer(parsed.data, auth);
    return NextResponse.json({ customer }, { status: created ? 201 : 200 });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      // Should now only happen on email-uniqueness or other UNIQUE constraints,
      // not on (externalSource, externalRef) — the service handles that idempotently.
      return jsonError(409, 'conflict', 'A customer with this identifier already exists');
    }
    throw err;
  }
}
