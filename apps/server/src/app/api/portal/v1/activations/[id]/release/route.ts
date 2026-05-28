import { NextResponse } from 'next/server';
import { ActivationStatus, BindingType } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { extractIp, writeAuditLog, AuditEventType } from '@/lib/audit';
import { getPortalSession } from '@/lib/portal/session';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function jsonError(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/portal/v1/activations/[id]/release
 *
 * Customer-side release of an own activation (e.g. user wants to free up a
 * device slot before moving to a new laptop). The activation must belong to
 * a license owned by the calling customer — verified via JOIN on license.customerId.
 */
export async function POST(req: Request, { params }: RouteParams) {
  const session = await getPortalSession();
  if (!session) return jsonError(401, 'unauthorized', 'Bitte einloggen');
  const { id } = await params;

  const activation = await prisma.activation.findUnique({
    where: { id },
    include: { license: { select: { customerId: true } } },
  });
  if (!activation) return jsonError(404, 'not_found', 'Aktivierung nicht gefunden');
  if (activation.license.customerId !== session.customerId) {
    // Same response shape as not-found to avoid leaking existence of other customers' activations.
    return jsonError(404, 'not_found', 'Aktivierung nicht gefunden');
  }
  // The domain binding is the app's fixed license identity, not a usage seat —
  // customers may view it but not release it (the admin UI still can). Enforced
  // server-side, not just hidden in the portal UI.
  if (activation.bindingType === BindingType.domain) {
    return jsonError(403, 'not_releasable', 'Die Domain-Bindung kann nicht freigegeben werden.');
  }
  if (activation.status === ActivationStatus.released) {
    return NextResponse.json({ released: false, reason: 'already_released' });
  }

  await prisma.activation.update({
    where: { id: activation.id },
    data: { status: ActivationStatus.released, releasedAt: new Date() },
  });

  await writeAuditLog({
    eventType: AuditEventType.ActivationReleased,
    actorType: 'system',
    actorId: session.customerId,
    targetType: 'Activation',
    targetId: activation.id,
    metadata: { releasedBy: 'portal', licenseId: activation.licenseId },
    ip: extractIp(req),
  });

  return NextResponse.json({ released: true });
}
