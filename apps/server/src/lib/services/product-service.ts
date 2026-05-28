import { Prisma, RevocationStrategy, type Product } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../prisma';
import { getLogger } from '../logger';
import { writeAuditLog, AuditEventType } from '../audit';
import { canonicalizePrefix } from '../license/license-key';
import { generateAndStoreSigningKey } from '../signing/signing-key-service';
import type { AdminAuthContext } from '../auth/admin-route-auth';
import { actorOf } from '../auth/admin-route-auth';

// -----------------------------------------------------------------------------
// Validation schemas
// -----------------------------------------------------------------------------

export const productSlugSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'slug must be lowercase kebab-case');

export const productCreateSchema = z.object({
  slug: productSlugSchema,
  name: z.string().min(1).max(120),
  featureCatalog: z.array(z.string().min(1).max(64)).default([]),
  revocationStrategy: z.nativeEnum(RevocationStrategy).default('recheck'),
  // Short defaults so a revoke/expire propagates quickly: online clients within
  // ~12h (recheck), offline grace capped at 48h (= jwtLifetime). Tunable up to
  // the maxima per product if a use case needs longer offline tolerance.
  recheckIntervalHours: z.number().int().min(1).max(720).default(12),
  jwtLifetimeHours: z.number().int().min(1).max(8760).default(48),
  licenseKeyPrefix: z.string().min(1).max(16).default('TROP'),
});

export const productUpdateSchema = productCreateSchema.partial();

export type ProductCreateInput = z.infer<typeof productCreateSchema>;
export type ProductUpdateInput = z.infer<typeof productUpdateSchema>;

// -----------------------------------------------------------------------------
// Service operations
// -----------------------------------------------------------------------------

export function listProducts(): Promise<Product[]> {
  return prisma.product.findMany({ orderBy: { createdAt: 'desc' } });
}

export function getProduct(id: string): Promise<Product | null> {
  return prisma.product.findUnique({ where: { id } });
}

export function getProductBySlug(slug: string): Promise<Product | null> {
  return prisma.product.findUnique({ where: { slug } });
}

export async function createProduct(
  input: ProductCreateInput,
  ctx: AdminAuthContext,
): Promise<Product> {
  const canonicalPrefix = canonicalizePrefix(input.licenseKeyPrefix);
  const product = await prisma.product.create({
    data: {
      slug: input.slug,
      name: input.name,
      featureCatalog: input.featureCatalog,
      revocationStrategy: input.revocationStrategy,
      recheckIntervalHours: input.recheckIntervalHours,
      jwtLifetimeHours: input.jwtLifetimeHours,
      licenseKeyPrefix: canonicalPrefix,
    },
  });

  // Auto-provision an Ed25519 signing key. Without it the first activate would
  // fail (nothing to sign with). If provisioning fails (e.g. KEK briefly
  // unavailable), compensate by deleting the just-created product so we never
  // leave a product that can never issue tokens — and only THEN audit creation.
  try {
    await generateAndStoreSigningKey({ id: product.id, slug: product.slug }, ctx);
  } catch (err) {
    await prisma.product.delete({ where: { id: product.id } }).catch((delErr) => {
      // Compensation itself failed — surface it (never swallow silently) so the
      // orphaned, key-less product gets noticed instead of silently breaking activate.
      getLogger().error(
        { event: 'product.compensation_failed', productId: product.id, err: delErr },
        'Failed to delete product after signing-key provisioning error',
      );
    });
    throw err;
  }

  await writeAuditLog({
    eventType: AuditEventType.ProductCreated,
    ...actorOf(ctx),
    targetType: 'Product',
    targetId: product.id,
    metadata: { slug: product.slug, name: product.name },
    ip: ctx.ip,
  });

  // Re-read so the returned product has activeSigningKeyId populated.
  return (await prisma.product.findUniqueOrThrow({ where: { id: product.id } }));
}

export async function updateProduct(
  id: string,
  input: ProductUpdateInput,
  ctx: AdminAuthContext,
): Promise<Product> {
  const data: Prisma.ProductUpdateInput = {};
  if (input.slug !== undefined) data.slug = input.slug;
  if (input.name !== undefined) data.name = input.name;
  if (input.featureCatalog !== undefined) data.featureCatalog = input.featureCatalog;
  if (input.revocationStrategy !== undefined) data.revocationStrategy = input.revocationStrategy;
  if (input.recheckIntervalHours !== undefined) data.recheckIntervalHours = input.recheckIntervalHours;
  if (input.jwtLifetimeHours !== undefined) data.jwtLifetimeHours = input.jwtLifetimeHours;
  if (input.licenseKeyPrefix !== undefined) {
    data.licenseKeyPrefix = canonicalizePrefix(input.licenseKeyPrefix);
  }

  const product = await prisma.product.update({ where: { id }, data });
  await writeAuditLog({
    eventType: AuditEventType.ProductUpdated,
    ...actorOf(ctx),
    targetType: 'Product',
    targetId: product.id,
    metadata: { fields: Object.keys(data) },
    ip: ctx.ip,
  });
  return product;
}

export class ProductInUseError extends Error {
  constructor(public readonly licenseCount: number) {
    super(`Cannot delete product: ${licenseCount} license(s) still reference it`);
    this.name = 'ProductInUseError';
  }
}

export async function deleteProduct(id: string, ctx: AdminAuthContext): Promise<void> {
  // Refuse delete if any license still references this product.
  // (Prisma's onDelete: Restrict would also block, but we surface a typed error.)
  const licenseCount = await prisma.license.count({ where: { productId: id } });
  if (licenseCount > 0) {
    throw new ProductInUseError(licenseCount);
  }

  const product = await prisma.product.delete({ where: { id } });
  await writeAuditLog({
    eventType: AuditEventType.ProductDeleted,
    ...actorOf(ctx),
    targetType: 'Product',
    targetId: id,
    metadata: { slug: product.slug, name: product.name },
    ip: ctx.ip,
  });
}
