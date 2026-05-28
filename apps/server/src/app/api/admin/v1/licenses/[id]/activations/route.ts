import { NextResponse } from 'next/server';
import { authorizeAdminRoute, enforceLicenseAccess, jsonError } from '@/lib/auth/admin-route-auth';
import { prisma } from '@/lib/prisma';
import { getSeatUsage, listActivationsForLicense } from '@/lib/binding/activation-service';
import { parseBindingPolicy } from '@/lib/binding/binding-policy';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * Lists the activations (occupied seats) of a license + the seat usage summary.
 * Used by the admin UI (session) and by an app's admin panel (API key, possibly
 * license-bound). Never returns the raw binding value — only the hash + the
 * non-sensitive display metadata.
 */
export async function GET(req: Request, { params }: RouteParams) {
  const auth = await authorizeAdminRoute(req, { requireScope: 'activations:read' });
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  const denied = enforceLicenseAccess(auth, id);
  if (denied) return denied;

  const license = await prisma.license.findUnique({ where: { id } });
  if (!license) return jsonError(404, 'not_found', 'License not found');

  const [activations, seats] = await Promise.all([
    listActivationsForLicense(id),
    getSeatUsage(id, parseBindingPolicy(license.bindingPolicy)),
  ]);

  return NextResponse.json({
    seats,
    activations: activations.map((a) => ({
      id: a.id,
      bindingType: a.bindingType,
      bindingValueHash: a.bindingValueHash,
      metadata: a.bindingValueMetadata,
      status: a.status,
      activatedAt: a.activatedAt.toISOString(),
      lastSeenAt: a.lastSeenAt.toISOString(),
      releasedAt: a.releasedAt ? a.releasedAt.toISOString() : null,
    })),
  });
}
