import { NextResponse } from 'next/server';
import { authorizeAdminRoute, jsonError } from '@/lib/auth/admin-route-auth';
import { CustomerNotFoundError, resendSetupMail } from '@/lib/services/customer-service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** Re-sends the portal setup mail (initial password link) to a customer. */
export async function POST(req: Request, { params }: RouteParams) {
  const auth = await authorizeAdminRoute(req, { requireScope: 'customers:write' });
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;

  try {
    await resendSetupMail(id, auth);
    return NextResponse.json({ sent: true });
  } catch (err) {
    if (err instanceof CustomerNotFoundError) {
      return jsonError(404, 'not_found', 'Customer not found');
    }
    throw err;
  }
}
