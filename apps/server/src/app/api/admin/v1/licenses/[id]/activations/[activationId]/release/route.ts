import { NextResponse } from 'next/server';
import {
  actorOf,
  authorizeAdminRoute,
  enforceLicenseAccess,
  jsonError,
} from '@/lib/auth/admin-route-auth';
import { releaseActivationById } from '@/lib/binding/activation-service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{ id: string; activationId: string }>;
}

/**
 * Releases a single seat (activation) of a license. Idempotent. Used by the
 * admin UI (session) and an app's admin panel (API key). The activation must
 * belong to the license in the path, otherwise 404.
 */
export async function POST(req: Request, { params }: RouteParams) {
  const auth = await authorizeAdminRoute(req, { requireScope: 'activations:write' });
  if (auth instanceof NextResponse) return auth;
  const { id, activationId } = await params;
  const denied = enforceLicenseAccess(auth, id);
  if (denied) return denied;

  const actor = actorOf(auth);
  const result = await releaseActivationById(id, activationId, {
    actorType: actor.actorType,
    actorId: actor.actorId,
    ip: auth.ip,
    via: auth.subject.kind === 'admin' ? 'admin' : 'api_key',
  });

  if (!result.ok) {
    return jsonError(404, 'not_found', 'Activation not found');
  }
  return NextResponse.json({ released: result.released, alreadyReleased: result.alreadyReleased });
}
