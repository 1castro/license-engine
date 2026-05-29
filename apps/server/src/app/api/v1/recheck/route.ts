import { NextResponse } from 'next/server';
import { z } from 'zod';
import type { RecheckResponse } from '@license-engine/shared-types';
import { ActivationStatus, BindingType, LicenseStatus, type License } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { extractIp, hashIp, writeAuditLog, AuditEventType } from '@/lib/audit';
import { getLogger } from '@/lib/logger';
import { recheckLimiter } from '@/lib/auth/rate-limit';
import { getSeatUsage } from '@/lib/binding/activation-service';
import { parseBindingPolicy } from '@/lib/binding/binding-policy';
import {
  signLicenseToken,
  TokenVerificationError,
  verifyLicenseToken,
} from '@/lib/token/token-service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const recheckRequestSchema = z.object({
  token: z.string().min(1).max(8192),
  productSlug: z.string().min(1).max(128),
});

const MAX_BODY_BYTES = 32 * 1024;

function jsonError(status: number, code: string, message: string, details?: unknown) {
  return NextResponse.json({ error: { code, message, details } }, { status });
}

export async function POST(req: Request) {
  const log = getLogger();
  try {
    return await handleRecheck(req);
  } catch (err) {
    // Uniform 500 shape so the SDK never misreads a raw HTML error.
    log.error({ event: 'recheck.internal_error', err }, 'Unhandled error during recheck');
    return jsonError(500, 'internal_error', 'Internal server error');
  }
}

async function handleRecheck(req: Request): Promise<NextResponse> {
  const ip = extractIp(req);
  const ipHashForLimit = hashIp(ip) ?? 'no-ip';

  if (!recheckLimiter.tryConsume(ipHashForLimit)) {
    return jsonError(429, 'rate_limited', 'Too many recheck attempts, slow down');
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
  const parsed = recheckRequestSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, 'validation_error', 'Invalid recheck payload', parsed.error.format());
  }

  // Look up the product first so we know which key-chain to verify against.
  const product = await prisma.product.findUnique({
    where: { slug: parsed.data.productSlug },
    select: { id: true, slug: true, jwtLifetimeHours: true, recheckIntervalHours: true },
  });
  if (!product) {
    return jsonError(404, 'unknown_product', 'Unknown product slug');
  }

  let claims;
  try {
    claims = await verifyLicenseToken({
      token: parsed.data.token,
      expectedAudience: parsed.data.productSlug,
      productId: product.id,
    });
  } catch (err) {
    if (err instanceof TokenVerificationError) {
      await writeAuditLog({
        eventType: AuditEventType.TokenVerifyFailed,
        actorType: 'anonymous',
        actorId: null,
        targetType: 'Product',
        targetId: product.id,
        metadata: { code: err.code },
        ip,
      });
      return jsonError(401, `token_${err.code}`, err.message);
    }
    throw err;
  }

  const licenseId = typeof claims.sub === 'string' ? claims.sub : null;
  if (!licenseId) {
    return jsonError(401, 'token_malformed', 'Token missing subject');
  }

  const license: License | null = await prisma.license.findUnique({ where: { id: licenseId } });
  if (!license || license.productId !== product.id) {
    return jsonError(404, 'license_not_active', 'License not found for this product');
  }

  if (license.status === LicenseStatus.revoked) {
    return NextResponse.json({
      status: 'revoked',
      revokedAt: license.revokedAt?.toISOString() ?? null,
    } satisfies RecheckResponse);
  }
  if (license.status === LicenseStatus.expired) {
    return NextResponse.json({ status: 'expired' } satisfies RecheckResponse);
  }
  if (license.expiresAt && license.expiresAt.getTime() <= Date.now()) {
    // Lazy-expire: flip the DB row and write a single LicenseExpired audit entry
    // so the dashboard reflects reality even if no background job ran. Idempotent
    // because we only update when status is still 'active' — concurrent rechecks
    // race the updateMany, but only one wins and writes the audit log.
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
        metadata: { reason: 'expiresAt-elapsed', source: 'recheck' },
        ip,
      });
    }
    return NextResponse.json({ status: 'expired' } satisfies RecheckResponse);
  }

  const featureFlags = Array.isArray(license.featureFlags)
    ? (license.featureFlags as unknown[]).filter((v): v is string => typeof v === 'string')
    : [];

  // Filter bindings: drop any whose Activation has been released since the
  // previous token was issued. A device that was deactivated must not silently
  // regain access via recheck — its binding stops being part of the token.
  // Also whitelist `type` against the BindingType enum: unknown values (e.g.
  // a forward-compat token from a future schema) are treated as "not active"
  // instead of being fed raw into a Prisma enum query (which would 500).
  const knownBindingTypes = new Set<string>(Object.values(BindingType));
  const tokenBindings: Array<{ type: BindingType; hash: string }> = Array.isArray(claims.bindings)
    ? (claims.bindings as Array<{ type: unknown; hash: unknown }>)
        .filter(
          (b): b is { type: string; hash: string } =>
            typeof b?.type === 'string' &&
            typeof b?.hash === 'string' &&
            knownBindingTypes.has(b.type),
        )
        .map((b) => ({ type: b.type as BindingType, hash: b.hash }))
    : [];
  // True iff the previous token had bindings (any, regardless of validity).
  const tokenHadBindings = Array.isArray(claims.bindings) && claims.bindings.length > 0;

  let activeBindings: Array<{ type: BindingType; hash: string }> = [];
  if (tokenBindings.length > 0) {
    const activeRows = await prisma.activation.findMany({
      where: {
        licenseId: license.id,
        status: ActivationStatus.active,
        OR: tokenBindings.map((b) => ({
          bindingType: b.type,
          bindingValueHash: b.hash,
        })),
      },
      select: { bindingType: true, bindingValueHash: true },
    });
    const stillActive = new Set(activeRows.map((r) => `${r.bindingType}|${r.bindingValueHash}`));
    activeBindings = tokenBindings.filter((b) => stillActive.has(`${b.type}|${b.hash}`));

    // A recheck is a "Lebenszeichen": bump lastSeenAt for the still-active
    // activations so the admin/portal "zuletzt aktiv" column reflects ongoing
    // usage, not just the last activate() call. No audit log here — re-checks
    // are intentionally not telemetered per CLAUDE.md.
    if (activeBindings.length > 0) {
      await prisma.activation.updateMany({
        where: {
          licenseId: license.id,
          status: ActivationStatus.active,
          OR: activeBindings.map((b) => ({ bindingType: b.type, bindingValueHash: b.hash })),
        },
        data: { lastSeenAt: new Date() },
      });
    }
  }

  // If the previous token carried bindings but every single one of them has
  // been released since (or contains only unknown types), we refuse to re-issue
  // a token. Issuing one would let a deactivated client keep validating until
  // exp — the intent of deactivate is exactly the opposite. Force re-activate.
  if (tokenHadBindings && activeBindings.length === 0) {
    // Distinct from license_not_active: the LICENSE is fine, but every binding
    // on this token was released (e.g. the seat was freed centrally). The client
    // must re-activate rather than treat the license as dead.
    return jsonError(
      403,
      'bindings_released',
      'All bindings for this token have been released — call activate() again',
    );
  }

  const signed = await signLicenseToken({
    license: {
      id: license.id,
      licenseKey: license.licenseKey,
      productId: license.productId,
      featureFlags,
    },
    product: { slug: product.slug, jwtLifetimeHours: product.jwtLifetimeHours },
    bindings: activeBindings.map((b) => ({ type: b.type, hash: b.hash })),
  });

  const seats = await getSeatUsage(license.id, parseBindingPolicy(license.bindingPolicy));

  return NextResponse.json({
    status: 'active',
    token: signed.token,
    expiresAt: signed.expiresAt.toISOString(),
    recheckIntervalHours: product.recheckIntervalHours,
    seats,
  } satisfies RecheckResponse);
}
