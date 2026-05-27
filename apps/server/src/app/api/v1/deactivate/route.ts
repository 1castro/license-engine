import { NextResponse } from 'next/server';
import { z } from 'zod';
import { BindingType } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { extractIp, hashIp, writeAuditLog, AuditEventType } from '@/lib/audit';
import { activateLimiter } from '@/lib/auth/rate-limit';
import { releaseActivation } from '@/lib/binding/activation-service';
import {
  TokenVerificationError,
  verifyLicenseToken,
} from '@/lib/token/token-service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const deactivateRequestSchema = z.object({
  token: z.string().min(1).max(8192),
  productSlug: z.string().min(1).max(128),
  bindingType: z.nativeEnum(BindingType),
  bindingValue: z.string().min(1).max(512),
});

const MAX_BODY_BYTES = 32 * 1024;

function jsonError(status: number, code: string, message: string, details?: unknown) {
  return NextResponse.json({ error: { code, message, details } }, { status });
}

export async function POST(req: Request) {
  const ip = extractIp(req);
  const ipHashForLimit = hashIp(ip) ?? 'no-ip';
  if (!activateLimiter.tryConsume(ipHashForLimit)) {
    return jsonError(429, 'rate_limited', 'Too many deactivation attempts');
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
  const parsed = deactivateRequestSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, 'validation_error', 'Invalid deactivate payload', parsed.error.format());
  }

  const product = await prisma.product.findUnique({
    where: { slug: parsed.data.productSlug },
    select: { id: true, slug: true },
  });
  if (!product) return jsonError(404, 'unknown_product', 'Unknown product slug');

  try {
    const claims = await verifyLicenseToken({
      token: parsed.data.token,
      expectedAudience: parsed.data.productSlug,
      productId: product.id,
    });
    const licenseId = typeof claims.sub === 'string' ? claims.sub : null;
    if (!licenseId) return jsonError(401, 'token_malformed', 'Token missing subject');

    const license = await prisma.license.findUnique({ where: { id: licenseId } });
    if (!license || license.productId !== product.id) {
      return jsonError(404, 'license_not_active', 'License not found for this product');
    }

    const result = await releaseActivation(
      { id: license.id },
      parsed.data.bindingType,
      parsed.data.bindingValue,
      ip,
    );

    return NextResponse.json({ released: result.released });
  } catch (err) {
    if (err instanceof TokenVerificationError) {
      await writeAuditLog({
        eventType: AuditEventType.TokenVerifyFailed,
        actorType: 'anonymous',
        actorId: null,
        targetType: 'Product',
        targetId: product.id,
        metadata: { code: err.code, op: 'deactivate' },
        ip,
      });
      return jsonError(401, `token_${err.code}`, err.message);
    }
    throw err;
  }
}
