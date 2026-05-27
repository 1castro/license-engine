import { generateKeyPair, exportPKCS8, exportSPKI, importPKCS8, importSPKI } from 'jose';
import type { KeyObject } from 'node:crypto';
import { prisma } from '../prisma';
import { envelopeEncrypt, envelopeDecrypt } from '../crypto/envelope';
import { writeAuditLog, AuditEventType } from '../audit';
import type { AdminAuthContext } from '../auth/admin-route-auth';
import { actorOf } from '../auth/admin-route-auth';

/**
 * SigningKey lifecycle for the License Engine.
 *
 * - Ed25519 keypairs are generated per product on Product creation.
 * - Private keys are wrapped with the KEK via AES-256-GCM (see envelope.ts)
 *   before persisting to DB; they are decrypted in-memory only when signing.
 * - Public keys are stored unencrypted as SPKI PEM for distribution via
 *   /.well-known/public-keys.
 * - On rotate, the old key stays in the DB with isActive=false so any token
 *   issued before the rotation can still be verified during the grace window.
 */

export const SIGNING_ALGORITHM = 'EdDSA' as const;

interface ProductIdentifier {
  id: string;
  slug: string;
}

/**
 * Generates a new Ed25519 keypair, stores the wrapped private key + plaintext
 * public key in the DB, and marks it as the product's active signing key.
 */
export async function generateAndStoreSigningKey(
  product: ProductIdentifier,
  ctx: AdminAuthContext | null,
): Promise<{ signingKeyId: string }> {
  const { privateKey, publicKey } = await generateKeyPair(SIGNING_ALGORITHM);

  const privateKeyPem = await exportPKCS8(privateKey);
  const publicKeyPem = await exportSPKI(publicKey);
  const privateKeyEncrypted = await envelopeEncrypt(new TextEncoder().encode(privateKeyPem));

  // Same transaction: create the new key, attach it as product's active key,
  // deactivate any previously-active key for this product.
  const result = await prisma.$transaction(async (tx) => {
    const newKey = await tx.signingKey.create({
      data: {
        productId: product.id,
        algorithm: 'Ed25519',
        publicKey: publicKeyPem,
        privateKeyEncrypted,
        isActive: true,
      },
    });

    await tx.signingKey.updateMany({
      where: { productId: product.id, id: { not: newKey.id }, isActive: true },
      data: { isActive: false, rotatedAt: new Date() },
    });

    await tx.product.update({
      where: { id: product.id },
      data: { activeSigningKeyId: newKey.id },
    });

    return newKey;
  });

  if (ctx) {
    await writeAuditLog({
      eventType: AuditEventType.SigningKeyCreated,
      ...actorOf(ctx),
      targetType: 'SigningKey',
      targetId: result.id,
      metadata: { productId: product.id, productSlug: product.slug },
      ip: ctx.ip,
    });
  }

  return { signingKeyId: result.id };
}

/**
 * Rotates the signing key for a product: generates a new active key, marks
 * the previous active key as inactive (still retained for verification).
 */
export async function rotateSigningKey(
  product: ProductIdentifier,
  ctx: AdminAuthContext,
): Promise<{ signingKeyId: string }> {
  const result = await generateAndStoreSigningKey(product, ctx);
  await writeAuditLog({
    eventType: AuditEventType.SigningKeyRotated,
    ...actorOf(ctx),
    targetType: 'SigningKey',
    targetId: result.signingKeyId,
    metadata: { productId: product.id, productSlug: product.slug },
    ip: ctx.ip,
  });
  return result;
}

/**
 * Loads the active signing key for a product. Returns the key id (used as JWT
 * `kid`) and the imported private key ready for jose.SignJWT.
 *
 * Throws ProductHasNoActiveSigningKeyError if no active key exists — this
 * indicates a misconfigured product and is a server-side bug, not a client error.
 */
export class ProductHasNoActiveSigningKeyError extends Error {
  constructor(public readonly productId: string) {
    super(`Product ${productId} has no active signing key`);
    this.name = 'ProductHasNoActiveSigningKeyError';
  }
}

export async function getActiveSigningKey(productId: string): Promise<{
  kid: string;
  privateKey: KeyObject;
}> {
  const key = await prisma.signingKey.findFirst({
    where: { productId, isActive: true },
  });
  if (!key) throw new ProductHasNoActiveSigningKeyError(productId);

  const privateKeyPem = new TextDecoder().decode(await envelopeDecrypt(key.privateKeyEncrypted));
  const privateKey = (await importPKCS8(privateKeyPem, SIGNING_ALGORITHM)) as KeyObject;

  return { kid: key.id, privateKey };
}

/**
 * Loads ALL signing keys for a product (active + rotated-out) as a kid → publicKey map.
 * Used for token verification: a recheck on a token issued with the previous key
 * must still validate during the rotation grace window.
 */
export async function getAllPublicKeysForProduct(
  productId: string,
): Promise<Map<string, KeyObject>> {
  const keys = await prisma.signingKey.findMany({ where: { productId } });
  const out = new Map<string, KeyObject>();
  for (const k of keys) {
    const pub = (await importSPKI(k.publicKey, SIGNING_ALGORITHM)) as KeyObject;
    out.set(k.id, pub);
  }
  return out;
}

/**
 * Returns the full set of public keys across all products for the .well-known
 * discovery endpoint. Includes both active and rotated-out keys so SDKs that
 * cache them can verify older tokens during a rotation grace window.
 */
export interface PublicKeyEntry {
  kid: string;
  productId: string;
  productSlug: string;
  algorithm: 'Ed25519';
  publicKey: string; // SPKI PEM
  isActive: boolean;
  createdAt: string;
  rotatedAt: string | null;
}

export async function listAllPublicKeys(): Promise<PublicKeyEntry[]> {
  const rows = await prisma.signingKey.findMany({
    where: { productId: { not: null } },
    include: { product: { select: { slug: true } } },
    orderBy: [{ productId: 'asc' }, { createdAt: 'desc' }],
  });
  return rows
    .filter((r) => r.productId !== null && r.product !== null)
    .map((r) => ({
      kid: r.id,
      productId: r.productId!,
      productSlug: r.product!.slug,
      algorithm: 'Ed25519' as const,
      publicKey: r.publicKey,
      isActive: r.isActive,
      createdAt: r.createdAt.toISOString(),
      rotatedAt: r.rotatedAt?.toISOString() ?? null,
    }));
}
