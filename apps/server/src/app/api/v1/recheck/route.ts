import { NextResponse } from 'next/server';
import { z } from 'zod';
import { LicenseStatus, type License } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { extractIp, hashIp, writeAuditLog, AuditEventType } from '@/lib/audit';
import { recheckLimiter } from '@/lib/auth/rate-limit';
import {
  signLicenseToken,
  TokenVerificationError,
  verifyLicenseToken,
} from '@/lib/token/token-service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const recheckRequestSchema = z.object({
  token: z.string().min(1),
  productSlug: z.string().min(1),
});

function jsonError(status: number, code: string, message: string, details?: unknown) {
  return NextResponse.json({ error: { code, message, details } }, { status });
}

export async function POST(req: Request) {
  const ip = extractIp(req);
  const ipHashForLimit = hashIp(ip) ?? 'no-ip';

  if (!recheckLimiter.tryConsume(ipHashForLimit)) {
    return jsonError(429, 'rate_limited', 'Too many recheck attempts, slow down');
  }

  let body: unknown;
  try {
    body = await req.json();
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
    select: { id: true, slug: true, jwtLifetimeHours: true },
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
    return NextResponse.json({ status: 'revoked', revokedAt: license.revokedAt?.toISOString() ?? null });
  }
  if (license.status === LicenseStatus.expired) {
    return NextResponse.json({ status: 'expired' });
  }
  if (license.expiresAt && license.expiresAt.getTime() <= Date.now()) {
    return NextResponse.json({ status: 'expired' });
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
    product: { slug: product.slug, jwtLifetimeHours: product.jwtLifetimeHours },
    // Carry forward the bindings from the previous token verbatim.
    bindings: Array.isArray(claims.bindings)
      ? (claims.bindings as Array<{ type: string; hash: string }>).map((b) => ({ type: b.type as never, hash: b.hash }))
      : [],
  });

  return NextResponse.json({
    status: 'active',
    token: signed.token,
    expiresAt: signed.expiresAt.toISOString(),
  });
}
