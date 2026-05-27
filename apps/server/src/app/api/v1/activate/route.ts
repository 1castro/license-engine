import { NextResponse } from 'next/server';
import { z } from 'zod';
import { LicenseStatus, type License } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getLogger } from '@/lib/logger';
import { extractIp, hashIp, writeAuditLog, AuditEventType } from '@/lib/audit';
import { activateLimiter } from '@/lib/auth/rate-limit';
import { normalizeLicenseKey } from '@/lib/license/license-key';
import {
  applyBindings,
  incomingBindingSchema,
  LicenseStateChangedError,
  MAX_BINDINGS_PER_ACTIVATE,
} from '@/lib/binding/activation-service';
import { BindingPolicyViolationError } from '@/lib/binding/binding-policy';
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

export async function POST(req: Request) {
  const log = getLogger();
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
    return jsonError(404, 'license_not_active', 'License not found, expired or does not belong to this product');
  }

  if (license.status !== LicenseStatus.active) {
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
    return jsonError(403, 'license_not_active', 'License has expired');
  }

  let activationResult;
  try {
    activationResult = await applyBindings(license, parsed.data.bindings, ip);
  } catch (err) {
    if (err instanceof BindingPolicyViolationError) {
      const status = err.reason === 'missing_required' ? 400 : 409;
      return jsonError(status, `binding_${err.reason}`, err.message, { bindingType: err.bindingType });
    }
    if (err instanceof LicenseStateChangedError) {
      // Lost the race: license was revoked/expired between our initial read
      // and the FOR-UPDATE lock. Surface as license_not_active so the client
      // re-evaluates from scratch.
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

  return NextResponse.json({
    token: signed.token,
    expiresAt: signed.expiresAt.toISOString(),
    recheckIntervalHours: license.product.recheckIntervalHours,
  });
}
