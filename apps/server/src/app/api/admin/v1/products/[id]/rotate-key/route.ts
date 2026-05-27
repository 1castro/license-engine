import { NextResponse } from 'next/server';
import { authorizeAdminRoute, jsonError } from '@/lib/auth/admin-route-auth';
import { getProduct } from '@/lib/services/product-service';
import { rotateSigningKey } from '@/lib/signing/signing-key-service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(req: Request, { params }: RouteParams) {
  const auth = await authorizeAdminRoute(req, { requireScope: 'products:write' });
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;

  const product = await getProduct(id);
  if (!product) return jsonError(404, 'not_found', 'Product not found');

  const { signingKeyId } = await rotateSigningKey(
    { id: product.id, slug: product.slug },
    auth,
  );
  return NextResponse.json({ signingKeyId, rotatedAt: new Date().toISOString() });
}
