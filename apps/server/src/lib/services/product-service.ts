import { Prisma, RevocationStrategy, type Product } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../prisma';
import { writeAuditLog, AuditEventType } from '../audit';
import { canonicalizePrefix } from '../license/license-key';
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
  recheckIntervalHours: z.number().int().min(1).max(720).default(24),
  jwtLifetimeHours: z.number().int().min(1).max(8760).default(168),
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
  await writeAuditLog({
    eventType: AuditEventType.ProductCreated,
    ...actorOf(ctx),
    targetType: 'Product',
    targetId: product.id,
    metadata: { slug: product.slug, name: product.name },
    ip: ctx.ip,
  });
  return product;
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
