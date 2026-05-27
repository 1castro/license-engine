import {
  ExternalSource,
  LicenseStatus,
  LicenseType,
  Prisma,
  type License,
} from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../prisma';
import { writeAuditLog, AuditEventType } from '../audit';
import { generateLicenseKey } from '../license/license-key';
import type { AdminAuthContext } from '../auth/admin-route-auth';
import { actorOf } from '../auth/admin-route-auth';

// -----------------------------------------------------------------------------
// Validation schemas
// -----------------------------------------------------------------------------

const cuidString = z.string().min(1).max(64);

const expiresAtSchema = z
  .union([z.string().datetime({ offset: true }), z.null()])
  .optional();

const featureFlagsSchema = z.array(z.string().min(1).max(64));

// bindingPolicy is intentionally free-form JSON at Tag 2 — no editor yet,
// the structure is validated by the activation flow downstream.
const bindingPolicySchema = z.record(z.unknown());

export const licenseCreateSchema = z.object({
  customerId: cuidString,
  productId: cuidString,
  type: z.nativeEnum(LicenseType),
  expiresAt: expiresAtSchema,
  featureFlags: featureFlagsSchema.default([]),
  bindingPolicy: bindingPolicySchema.default({}),
  externalRef: z.string().min(1).max(200).optional(),
  externalSource: z.nativeEnum(ExternalSource).default('manual'),
});

export const licenseUpdateSchema = z.object({
  expiresAt: expiresAtSchema,
  featureFlags: featureFlagsSchema.optional(),
  bindingPolicy: bindingPolicySchema.optional(),
});

export const licenseRevokeSchema = z.object({
  reason: z.string().min(1).max(500),
});

export const licenseListFilterSchema = z.object({
  customerId: cuidString.optional(),
  productId: cuidString.optional(),
  status: z.nativeEnum(LicenseStatus).optional(),
});

export type LicenseCreateInput = z.infer<typeof licenseCreateSchema>;
export type LicenseUpdateInput = z.infer<typeof licenseUpdateSchema>;
export type LicenseListFilter = z.infer<typeof licenseListFilterSchema>;

// -----------------------------------------------------------------------------
// Typed errors
// -----------------------------------------------------------------------------

export class ProductNotFoundError extends Error {
  constructor(public readonly productId: string) {
    super(`Product not found: ${productId}`);
    this.name = 'ProductNotFoundError';
  }
}

export class LicenseAlreadyRevokedError extends Error {
  constructor(public readonly licenseId: string) {
    super(`License already revoked: ${licenseId}`);
    this.name = 'LicenseAlreadyRevokedError';
  }
}

export class LicenseNotFoundError extends Error {
  constructor(public readonly licenseId: string) {
    super(`License not found: ${licenseId}`);
    this.name = 'LicenseNotFoundError';
  }
}

// -----------------------------------------------------------------------------
// Service operations
// -----------------------------------------------------------------------------

export function listLicenses(filter: LicenseListFilter = {}): Promise<License[]> {
  const where: Prisma.LicenseWhereInput = {};
  if (filter.customerId) where.customerId = filter.customerId;
  if (filter.productId) where.productId = filter.productId;
  if (filter.status) where.status = filter.status;
  return prisma.license.findMany({ where, orderBy: { createdAt: 'desc' } });
}

export function getLicense(id: string): Promise<License | null> {
  return prisma.license.findUnique({ where: { id } });
}

const LICENSE_KEY_MAX_RETRIES = 3;

export async function createLicense(
  input: LicenseCreateInput,
  ctx: AdminAuthContext,
): Promise<{ license: License; created: boolean }> {
  // Idempotency: when called with a non-manual externalRef/source pair, an
  // existing record short-circuits creation. Webhooks may retry repeatedly.
  if (input.externalRef && input.externalSource !== 'manual') {
    const existing = await prisma.license.findUnique({
      where: {
        externalRef_unique: {
          externalSource: input.externalSource,
          externalRef: input.externalRef,
        },
      },
    });
    if (existing) {
      return { license: existing, created: false };
    }
  }

  const product = await prisma.product.findUnique({ where: { id: input.productId } });
  if (!product) {
    throw new ProductNotFoundError(input.productId);
  }

  const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
  const featureFlags = input.featureFlags as Prisma.InputJsonValue;
  const bindingPolicy = input.bindingPolicy as Prisma.InputJsonValue;

  // Retry only on licenseKey UNIQUE collisions (cosmically unlikely, but
  // cheap to defend against). All other Prisma errors bubble up immediately.
  let lastError: unknown;
  for (let attempt = 0; attempt < LICENSE_KEY_MAX_RETRIES; attempt++) {
    const licenseKey = generateLicenseKey(product.licenseKeyPrefix);
    try {
      const license = await prisma.license.create({
        data: {
          customerId: input.customerId,
          productId: input.productId,
          licenseKey,
          type: input.type,
          expiresAt,
          featureFlags,
          bindingPolicy,
          externalRef: input.externalRef,
          externalSource: input.externalSource,
        },
      });
      await writeAuditLog({
        eventType: AuditEventType.LicenseCreated,
        ...actorOf(ctx),
        targetType: 'License',
        targetId: license.id,
        metadata: {
          customerId: license.customerId,
          productId: license.productId,
          type: license.type,
          externalSource: license.externalSource,
        },
        ip: ctx.ip,
      });
      return { license, created: true };
    } catch (err) {
      lastError = err;
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002' &&
        Array.isArray(err.meta?.target) &&
        (err.meta.target as string[]).includes('licenseKey')
      ) {
        continue;
      }
      throw err;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error('Failed to allocate a unique license key');
}

export async function updateLicense(
  id: string,
  input: LicenseUpdateInput,
  ctx: AdminAuthContext,
): Promise<License> {
  const data: Prisma.LicenseUpdateInput = {};
  if (input.expiresAt !== undefined) {
    data.expiresAt = input.expiresAt === null ? null : new Date(input.expiresAt);
  }
  if (input.featureFlags !== undefined) {
    data.featureFlags = input.featureFlags as Prisma.InputJsonValue;
  }
  if (input.bindingPolicy !== undefined) {
    data.bindingPolicy = input.bindingPolicy as Prisma.InputJsonValue;
  }

  const license = await prisma.license.update({ where: { id }, data });
  await writeAuditLog({
    eventType: AuditEventType.LicenseUpdated,
    ...actorOf(ctx),
    targetType: 'License',
    targetId: license.id,
    metadata: { fields: Object.keys(data) },
    ip: ctx.ip,
  });
  return license;
}

export async function revokeLicense(
  id: string,
  reason: string,
  ctx: AdminAuthContext,
): Promise<License> {
  const current = await prisma.license.findUnique({ where: { id } });
  if (!current) {
    throw new LicenseNotFoundError(id);
  }
  if (current.status === LicenseStatus.revoked) {
    throw new LicenseAlreadyRevokedError(id);
  }

  const license = await prisma.license.update({
    where: { id },
    data: {
      status: LicenseStatus.revoked,
      revokedAt: new Date(),
      revocationReason: reason,
    },
  });
  await writeAuditLog({
    eventType: AuditEventType.LicenseRevoked,
    ...actorOf(ctx),
    targetType: 'License',
    targetId: license.id,
    metadata: { reason },
    ip: ctx.ip,
  });
  return license;
}
