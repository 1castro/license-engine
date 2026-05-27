import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { authorizeAdminRoute, jsonError } from '@/lib/auth/admin-route-auth';
import {
  deleteProduct,
  getProduct,
  ProductInUseError,
  productUpdateSchema,
  updateProduct,
} from '@/lib/services/product-service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(req: Request, { params }: RouteParams) {
  const auth = await authorizeAdminRoute(req, { requireScope: 'products:read' });
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;

  const product = await getProduct(id);
  if (!product) return jsonError(404, 'not_found', 'Product not found');
  return NextResponse.json({ product });
}

export async function PATCH(req: Request, { params }: RouteParams) {
  const auth = await authorizeAdminRoute(req, { requireScope: 'products:write' });
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, 'invalid_json', 'Request body must be valid JSON');
  }
  const parsed = productUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, 'validation_error', 'Invalid product payload', parsed.error.format());
  }

  try {
    const product = await updateProduct(id, parsed.data, auth);
    return NextResponse.json({ product });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === 'P2025') return jsonError(404, 'not_found', 'Product not found');
      if (err.code === 'P2002') return jsonError(409, 'conflict', 'Slug already in use');
    }
    throw err;
  }
}

export async function DELETE(req: Request, { params }: RouteParams) {
  const auth = await authorizeAdminRoute(req, { requireScope: 'products:write' });
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;

  try {
    await deleteProduct(id, auth);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    if (err instanceof ProductInUseError) {
      return jsonError(409, 'product_in_use', err.message, { licenseCount: err.licenseCount });
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      return jsonError(404, 'not_found', 'Product not found');
    }
    throw err;
  }
}
