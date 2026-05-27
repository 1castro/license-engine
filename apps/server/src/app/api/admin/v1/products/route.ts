import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { authorizeAdminRoute, jsonError } from '@/lib/auth/admin-route-auth';
import {
  createProduct,
  listProducts,
  productCreateSchema,
} from '@/lib/services/product-service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: Request) {
  const auth = await authorizeAdminRoute(req, { requireScope: 'products:read' });
  if (auth instanceof NextResponse) return auth;

  const products = await listProducts();
  return NextResponse.json({ products });
}

export async function POST(req: Request) {
  const auth = await authorizeAdminRoute(req, { requireScope: 'products:write' });
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, 'invalid_json', 'Request body must be valid JSON');
  }
  const parsed = productCreateSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, 'validation_error', 'Invalid product payload', parsed.error.format());
  }

  try {
    const product = await createProduct(parsed.data, auth);
    return NextResponse.json({ product }, { status: 201 });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return jsonError(409, 'conflict', `A product with slug "${parsed.data.slug}" already exists`);
    }
    throw err;
  }
}
