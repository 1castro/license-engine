import { createHash } from 'node:crypto';
import type { BindingType } from '@prisma/client';

/**
 * Hash a binding value for storage.
 *
 * We include the binding type in the digest so the same string value used
 * as two different binding kinds (e.g. a hostname used as both domain and
 * installation) ends up with different hashes — preventing accidental
 * cross-type matches.
 *
 * SHA-256 is used; binding values are already opaque tokens to us
 * (domain names, fingerprints, opaque installation ids), no salt needed.
 */
export function hashBindingValue(type: BindingType, value: string): string {
  return createHash('sha256').update(`${type}:${value}`, 'utf8').digest('hex');
}
