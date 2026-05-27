/**
 * License-key format validator — mirrors the server-side implementation
 * in apps/server/src/lib/license/license-key.ts.
 *
 * Kept duplicated rather than shared, so the SDK has zero server dependencies
 * and ships as a tiny package. The two implementations must stay in sync.
 */

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const ALPHABET_SET = new Set(ALPHABET.split(''));
const GROUP_COUNT = 4;
const GROUP_SIZE = 4;
const PAYLOAD_PER_GROUP = GROUP_SIZE - 1;

function crockfordNormalize(input: string): string {
  return input
    .toUpperCase()
    .replace(/O/g, '0')
    .replace(/I/g, '1')
    .replace(/L/g, '1')
    .replace(/U/g, 'V');
}

function indexOfChar(ch: string): number {
  const idx = ALPHABET.indexOf(ch);
  if (idx < 0) throw new Error(`Illegal character: ${ch}`);
  return idx;
}

function checksumChar(payload: string, groupIndex: number, prefix: string): string {
  let sum = groupIndex;
  for (let i = 0; i < prefix.length; i++) sum += (i + 1) * indexOfChar(prefix[i]!);
  for (let i = 0; i < payload.length; i++) sum += (i + 4) * indexOfChar(payload[i]!);
  return ALPHABET[sum % ALPHABET.length]!;
}

export type LicenseKeyValidation =
  | { valid: true; canonical: string; prefix: string; groups: string[] }
  | { valid: false; reason: string };

export function validateLicenseKey(key: unknown): LicenseKeyValidation {
  if (typeof key !== 'string') return { valid: false, reason: 'not a string' };
  const normalized = crockfordNormalize(key.trim());
  const parts = normalized.split('-');
  if (parts.length !== GROUP_COUNT + 1) {
    return { valid: false, reason: `expected ${GROUP_COUNT + 1} parts, got ${parts.length}` };
  }
  const [prefix, ...groups] = parts as [string, ...string[]];
  if (prefix.length === 0) return { valid: false, reason: 'empty prefix' };
  for (const ch of prefix) {
    if (!ALPHABET_SET.has(ch)) return { valid: false, reason: `illegal character "${ch}" in prefix` };
  }
  for (let g = 0; g < groups.length; g++) {
    const group = groups[g]!;
    if (group.length !== GROUP_SIZE) return { valid: false, reason: `group ${g + 1} wrong length` };
    for (const ch of group) {
      if (!ALPHABET_SET.has(ch)) return { valid: false, reason: `illegal character "${ch}" in group ${g + 1}` };
    }
    const payload = group.slice(0, PAYLOAD_PER_GROUP);
    const expected = checksumChar(payload, g, prefix);
    if (group[PAYLOAD_PER_GROUP] !== expected) {
      return { valid: false, reason: `group ${g + 1} checksum mismatch` };
    }
  }
  return { valid: true, canonical: `${prefix}-${groups.join('-')}`, prefix, groups };
}

export function normalizeLicenseKey(key: string): string | null {
  const v = validateLicenseKey(key);
  return v.valid ? v.canonical : null;
}
