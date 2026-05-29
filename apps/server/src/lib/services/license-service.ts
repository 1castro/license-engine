import {
  ActivationStatus,
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
import { bindingPolicySchema } from '../binding/binding-policy';
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

// Display-only billing metadata (mirrored from the PSP) — never payment logic.
// nullable: an update may pass null to CLEAR a field; undefined leaves it untouched.
// min(1): an empty string is rejected (400) — clearing is done via null, not "".
const billingDisplaySchema = {
  planName: z.string().min(1).max(120).nullable().optional(),
  priceDisplay: z.string().min(1).max(120).nullable().optional(),
  billingInterval: z.string().min(1).max(40).nullable().optional(),
};

// Strict write-path validation of the binding policy: required[] must be valid
// BindingTypes, maxPerType must be positive ints. Unknown keys are dropped.
// (Same schema the activation flow reads, so write and read can't diverge.)

export const licenseCreateSchema = z.object({
  customerId: cuidString,
  productId: cuidString,
  type: z.nativeEnum(LicenseType),
  expiresAt: expiresAtSchema,
  featureFlags: featureFlagsSchema.default([]),
  bindingPolicy: bindingPolicySchema,
  externalRef: z.string().min(1).max(200).optional(),
  externalSource: z.nativeEnum(ExternalSource).default('manual'),
  ...billingDisplaySchema,
});

export const licenseUpdateSchema = z.object({
  expiresAt: expiresAtSchema,
  featureFlags: featureFlagsSchema.optional(),
  bindingPolicy: bindingPolicySchema.optional(),
  ...billingDisplaySchema,
});

export const licenseRevokeSchema = z.object({
  reason: z.string().min(1).max(500),
});

export const licenseListFilterSchema = z.object({
  customerId: cuidString.optional(),
  productId: cuidString.optional(),
  status: z.nativeEnum(LicenseStatus).optional(),
  // Lets a webhook sync module find an existing license by its PSP reference
  // (then PATCH expiresAt to renew / revoke) — idempotent over (source, ref).
  externalRef: z.string().min(1).max(200).optional(),
  externalSource: z.nativeEnum(ExternalSource).optional(),
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

export class LicenseCustomerNotFoundError extends Error {
  constructor(public readonly customerId: string) {
    super(`Customer not found: ${customerId}`);
    this.name = 'LicenseCustomerNotFoundError';
  }
}

export class FeatureFlagsNotInCatalogError extends Error {
  constructor(public readonly unknownFlags: string[]) {
    super(`Feature flags not in product catalog: ${unknownFlags.join(', ')}`);
    this.name = 'FeatureFlagsNotInCatalogError';
  }
}

/** Enforces the schema invariant that a license's featureFlags ⊆ Product.featureCatalog. */
function assertFeatureFlagsInCatalog(featureFlags: string[], featureCatalog: unknown): void {
  const catalog = Array.isArray(featureCatalog)
    ? (featureCatalog as unknown[]).filter((v): v is string => typeof v === 'string')
    : [];
  const unknown = featureFlags.filter((f) => !catalog.includes(f));
  if (unknown.length > 0) {
    throw new FeatureFlagsNotInCatalogError(unknown);
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
  if (filter.externalRef) where.externalRef = filter.externalRef;
  if (filter.externalSource) where.externalSource = filter.externalSource;
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
  // Idempotency: any (externalSource, externalRef) pair is treated as a
  // dedup key — webhooks and manual API callers alike. The previous variant
  // restricted to non-manual sources, but admins importing from spreadsheets
  // also benefit from re-import safety, and the externalRef_unique constraint
  // covers manual anyway.
  if (input.externalRef) {
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
  // Symmetric to the product check: surface a clean typed error instead of a
  // raw FK violation when the customer doesn't exist.
  const customer = await prisma.customer.findUnique({
    where: { id: input.customerId },
    select: { id: true },
  });
  if (!customer) {
    throw new LicenseCustomerNotFoundError(input.customerId);
  }
  assertFeatureFlagsInCatalog(input.featureFlags, product.featureCatalog);

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
          planName: input.planName,
          priceDisplay: input.priceDisplay,
          billingInterval: input.billingInterval,
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
    // Enforce featureFlags ⊆ the product's catalog. If the license doesn't
    // exist, skip — the update below raises P2025 → 404 in the route.
    const lic = await prisma.license.findUnique({
      where: { id },
      select: { product: { select: { featureCatalog: true } } },
    });
    if (lic) {
      assertFeatureFlagsInCatalog(input.featureFlags, lic.product.featureCatalog);
    }
    data.featureFlags = input.featureFlags as Prisma.InputJsonValue;
  }
  if (input.bindingPolicy !== undefined) {
    data.bindingPolicy = input.bindingPolicy as Prisma.InputJsonValue;
  }
  // Display-only billing metadata (mirrored from the PSP). null clears the field.
  if (input.planName !== undefined) data.planName = input.planName;
  if (input.priceDisplay !== undefined) data.priceDisplay = input.priceDisplay;
  if (input.billingInterval !== undefined) data.billingInterval = input.billingInterval;

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

  // Revoke the license AND release its active seats in one transaction, so the
  // seat usage immediately reflects reality (a revoked license occupies nothing).
  const license = await prisma.$transaction(async (tx) => {
    const updated = await tx.license.update({
      where: { id },
      data: {
        status: LicenseStatus.revoked,
        revokedAt: new Date(),
        revocationReason: reason,
      },
    });
    await tx.activation.updateMany({
      where: { licenseId: id, status: ActivationStatus.active },
      data: { status: ActivationStatus.released, releasedAt: new Date() },
    });
    return updated;
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
