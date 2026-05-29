import { NextResponse } from 'next/server';
import { z } from 'zod';
import type { ActivateResponse } from '@license-engine/shared-types';
import { LicenseStatus, type License } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getLogger } from '@/lib/logger';
import { extractIp, hashIp, writeAuditLog, AuditEventType } from '@/lib/audit';
import { activateLimiter } from '@/lib/auth/rate-limit';
import { normalizeLicenseKey } from '@/lib/license/license-key';
import {
  applyBindings,
  getSeatUsage,
  incomingBindingSchema,
  LicenseStateChangedError,
  MAX_BINDINGS_PER_ACTIVATE,
} from '@/lib/binding/activation-service';
import { BindingPolicyViolationError, parseBindingPolicy } from '@/lib/binding/binding-policy';
import { signLicenseToken } from '@/lib/token/token-service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const activateRequestSchema = z.object({
  licenseKey: z.string().min(1).max(64),
  productSlug: z.string().min(1).max(128),
  bindings: z.array(incomingBindingSchema).max(MAX_BINDINGS_PER_ACTIVATE).default([]),
});

/** Body-size cap to prevent oversized JSON payloads exhausting memory. */
const MAX_BODY_BYTES = 32 * 1024; // 32 KiB

function jsonError(status: number, code: string, message: string, details?: unknown) {
  return NextResponse.json({ error: { code, message, details } }, { status });
}

type RejectReason =
  | 'key_ungültig'
  | 'lizenz_unbekannt'
  | 'lizenz_inaktiv'
  | 'lizenz_abgelaufen'
  | 'limit_erreicht'
  | 'pflichtbindung_fehlt';

/**
 * Records a refused activation attempt as an audit event so it surfaces in the
 * admin dashboard / per-license view and as a plain count in the customer
 * portal. Only genuine licensing rejections are recorded — transport noise
 * (rate-limit, malformed JSON, oversized body) is intentionally skipped.
 * writeAuditLog is fire-and-forget (never throws), so awaiting it is safe.
 */
async function auditActivationRejected(
  reason: RejectReason,
  opts: {
    licenseId?: string | null;
    bindingType?: string | null;
    attemptedBindings?: Array<{ type: string; value: string; metadata?: Record<string, unknown> }>;
    productSlug?: string;
  },
  ip: string | null,
): Promise<void> {
  // Truncate attempted values — forensic context, not the hashed seat anchor.
  const attempted = (opts.attemptedBindings ?? []).map((b) => ({
    type: b.type,
    value: b.value.slice(0, 64),
    displayName:
      typeof b.metadata?.displayName === 'string' ? b.metadata.displayName.slice(0, 80) : undefined,
  }));
  await writeAuditLog({
    eventType: AuditEventType.ActivationRejected,
    actorType: 'anonymous',
    actorId: null,
    targetType: 'License',
    targetId: opts.licenseId ?? null,
    metadata: {
      reason,
      bindingType: opts.bindingType ?? null,
      productSlug: opts.productSlug,
      attemptedBindings: attempted.length > 0 ? attempted : undefined,
    },
    ip,
  });
}

export async function POST(req: Request) {
  const log = getLogger();
  try {
    return await handleActivate(req, log);
  } catch (err) {
    // Uniform 500 shape so the SDK/clients never get a raw HTML error they would
    // misread (e.g. as license_not_active). Unexpected errors only.
    log.error({ event: 'activate.internal_error', err }, 'Unhandled error during activation');
    return jsonError(500, 'internal_error', 'Internal server error');
  }
}

async function handleActivate(
  req: Request,
  log: ReturnType<typeof getLogger>,
): Promise<NextResponse> {
  const ip = extractIp(req);
  const ipHashForLimit = hashIp(ip) ?? 'no-ip';

  if (!activateLimiter.tryConsume(ipHashForLimit)) {
    return jsonError(429, 'rate_limited', 'Too many activation attempts, slow down');
  }

  let body: unknown;
  try {
    const rawText = await req.text();
    if (rawText.length > MAX_BODY_BYTES) {
      return jsonError(413, 'payload_too_large', `Request body exceeds ${MAX_BODY_BYTES} bytes`);
    }
    body = JSON.parse(rawText);
  } catch {
    return jsonError(400, 'invalid_json', 'Request body must be valid JSON');
  }
  const parsed = activateRequestSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, 'validation_error', 'Invalid activation payload', parsed.error.format());
  }

  const canonicalKey = normalizeLicenseKey(parsed.data.licenseKey);
  if (!canonicalKey) {
    await auditActivationRejected('key_ungültig', { productSlug: parsed.data.productSlug }, ip);
    return jsonError(400, 'invalid_license_key', 'License key format / checksum invalid');
  }

  const license:
    | (License & {
        product: { slug: string; jwtLifetimeHours: number; recheckIntervalHours: number } | null;
      })
    | null = await prisma.license.findUnique({
    where: { licenseKey: canonicalKey },
    include: {
      product: { select: { slug: true, jwtLifetimeHours: true, recheckIntervalHours: true } },
    },
  });

  // Uniform "license not active" response — do not leak whether the key exists.
  if (!license || !license.product || license.product.slug !== parsed.data.productSlug) {
    log.warn({ event: 'activate.unknown_or_wrong_product' }, 'Activate rejected');
    // If the key resolves to a real license but for the wrong product, attach
    // its id so the attempt is traceable to that license; otherwise log anonymously.
    await auditActivationRejected(
      'lizenz_unbekannt',
      { licenseId: license?.id ?? null, productSlug: parsed.data.productSlug },
      ip,
    );
    return jsonError(404, 'license_not_active', 'License not found, expired or does not belong to this product');
  }

  if (license.status !== LicenseStatus.active) {
    await auditActivationRejected('lizenz_inaktiv', { licenseId: license.id }, ip);
    return jsonError(403, 'license_not_active', 'License is not active');
  }
  if (license.expiresAt && license.expiresAt.getTime() <= Date.now()) {
    // Lazy-expire on read so the row state matches reality even without a job.
    const flipped = await prisma.license.updateMany({
      where: { id: license.id, status: LicenseStatus.active },
      data: { status: LicenseStatus.expired },
    });
    if (flipped.count === 1) {
      await writeAuditLog({
        eventType: AuditEventType.LicenseExpired,
        actorType: 'system',
        actorId: null,
        targetType: 'License',
        targetId: license.id,
        metadata: { reason: 'expiresAt-elapsed', source: 'activate' },
        ip,
      });
    }
    await auditActivationRejected('lizenz_abgelaufen', { licenseId: license.id }, ip);
    return jsonError(403, 'license_not_active', 'License has expired');
  }

  let activationResult;
  try {
    activationResult = await applyBindings(license, parsed.data.bindings, ip);
  } catch (err) {
    if (err instanceof BindingPolicyViolationError) {
      const status = err.reason === 'missing_required' ? 400 : 409;
      await auditActivationRejected(
        err.reason === 'missing_required' ? 'pflichtbindung_fehlt' : 'limit_erreicht',
        {
          licenseId: license.id,
          bindingType: err.bindingType,
          attemptedBindings: parsed.data.bindings,
        },
        ip,
      );
      return jsonError(status, `binding_${err.reason}`, err.message, { bindingType: err.bindingType });
    }
    if (err instanceof LicenseStateChangedError) {
      // Lost the race: license was revoked/expired between our initial read
      // and the FOR-UPDATE lock. Surface as license_not_active so the client
      // re-evaluates from scratch.
      await auditActivationRejected('lizenz_inaktiv', { licenseId: license.id }, ip);
      return jsonError(403, 'license_not_active', `License became ${err.newStatus} during activation`);
    }
    throw err;
  }

  const featureFlags = Array.isArray(license.featureFlags)
    ? (license.featureFlags as unknown[]).filter((v): v is string => typeof v === 'string')
    : [];

  const signed = await signLicenseToken({
    license: {
      id: license.id,
      licenseKey: license.licenseKey,
      productId: license.productId,
      featureFlags,
    },
    product: { slug: license.product.slug, jwtLifetimeHours: license.product.jwtLifetimeHours },
    bindings: activationResult.activations.map((a) => ({
      type: a.bindingType,
      hash: a.bindingValueHash,
    })),
  });

  // Audit the activation event at the license level (per-activation audit is
  // already written inside applyBindings for each new Activation row).
  if (activationResult.newlyCreated > 0) {
    await writeAuditLog({
      eventType: AuditEventType.ActivationCreated,
      actorType: 'anonymous',
      actorId: null,
      targetType: 'License',
      targetId: license.id,
      metadata: { newActivations: activationResult.newlyCreated },
      ip,
    });
  }

  const seats = await getSeatUsage(license.id, parseBindingPolicy(license.bindingPolicy));

  return NextResponse.json({
    token: signed.token,
    expiresAt: signed.expiresAt.toISOString(),
    recheckIntervalHours: license.product.recheckIntervalHours,
    seats,
  } satisfies ActivateResponse);
}
