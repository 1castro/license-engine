import { randomBytes } from 'node:crypto';

/**
 * License-key format: `PREFIX-XXXX-XXXX-XXXX-XXXX`.
 *
 * Per group of 4 characters: the first 3 are payload, the 4th is a checksum.
 * Alphabet is Crockford Base32 (32 chars, no I/L/O/U).
 *
 * Crockford normalization is applied transparently to user input:
 *   O → 0, I → 1, L → 1, U → V
 * So a prefix like "TROP" is stored canonically as "TR0P", and a typed key
 * with O or I is accepted as if the user had typed the canonical form.
 *
 * The checksum factors in the prefix and the group index, so a swapped group
 * (e.g. typo where the user pasted groups in the wrong order) is detected.
 *
 * This is not a cryptographic check — it's a UX safety net to catch the
 * majority of single-character typos and group swaps before they hit the
 * server. Server-side, the key is looked up by exact match against the DB.
 */

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const ALPHABET_SET = new Set(ALPHABET.split(''));
const GROUP_COUNT = 4;
const GROUP_SIZE = 4;
const PAYLOAD_PER_GROUP = GROUP_SIZE - 1;

/** Crockford-style normalization for input: O→0, I/L→1, U→V, uppercase. */
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
  if (idx < 0) {
    throw new Error(`License key contains illegal character: ${ch}`);
  }
  return idx;
}

function checksumChar(payload: string, groupIndex: number, prefix: string): string {
  let sum = groupIndex;
  for (let i = 0; i < prefix.length; i++) {
    sum += (i + 1) * indexOfChar(prefix[i]!);
  }
  for (let i = 0; i < payload.length; i++) {
    sum += (i + 4) * indexOfChar(payload[i]!);
  }
  return ALPHABET[sum % ALPHABET.length]!;
}

/**
 * Validates and normalizes a prefix to canonical Crockford form.
 * Returns the canonical prefix or throws if it can't be made valid.
 */
export function canonicalizePrefix(prefix: string): string {
  const normalized = crockfordNormalize(prefix.trim());
  if (normalized.length === 0) {
    throw new Error('License key prefix must not be empty');
  }
  for (const ch of normalized) {
    if (!ALPHABET_SET.has(ch)) {
      throw new Error(`License key prefix contains illegal character "${ch}" after normalization`);
    }
  }
  return normalized;
}

function randomPayloadGroup(): string {
  // Use rejection sampling on bytes to keep distribution uniform across the 32-symbol alphabet.
  const out: string[] = [];
  while (out.length < PAYLOAD_PER_GROUP) {
    const bytes = randomBytes(PAYLOAD_PER_GROUP * 2);
    for (const b of bytes) {
      if (out.length >= PAYLOAD_PER_GROUP) break;
      if (b < 256 - (256 % ALPHABET.length)) {
        out.push(ALPHABET[b % ALPHABET.length]!);
      }
    }
  }
  return out.join('');
}

/**
 * Generates a new license key for the given product prefix.
 * Prefix is normalized to canonical Crockford form before use.
 */
export function generateLicenseKey(prefix: string): string {
  const canonicalPrefix = canonicalizePrefix(prefix);
  const groups: string[] = [];
  for (let g = 0; g < GROUP_COUNT; g++) {
    const payload = randomPayloadGroup();
    const check = checksumChar(payload, g, canonicalPrefix);
    groups.push(payload + check);
  }
  return `${canonicalPrefix}-${groups.join('-')}`;
}

export type LicenseKeyValidation =
  | { valid: true; prefix: string; groups: string[]; canonical: string }
  | { valid: false; reason: string };

/**
 * Validates a license key by structure, alphabet, and per-group checksum.
 * Accepts non-canonical input (O, I, L, U) and returns the canonical form.
 * Server-side, the canonical form is then looked up against the database.
 */
export function validateLicenseKey(key: string): LicenseKeyValidation {
  if (typeof key !== 'string') {
    return { valid: false, reason: 'not a string' };
  }
  const normalized = crockfordNormalize(key.trim());
  const parts = normalized.split('-');
  if (parts.length !== GROUP_COUNT + 1) {
    return { valid: false, reason: `expected ${GROUP_COUNT + 1} parts, got ${parts.length}` };
  }
  const [prefix, ...groups] = parts as [string, ...string[]];

  if (prefix.length === 0) {
    return { valid: false, reason: 'empty prefix' };
  }
  for (const ch of prefix) {
    if (!ALPHABET_SET.has(ch)) {
      return { valid: false, reason: `prefix has illegal character "${ch}"` };
    }
  }

  for (let g = 0; g < groups.length; g++) {
    const group = groups[g]!;
    if (group.length !== GROUP_SIZE) {
      return { valid: false, reason: `group ${g + 1} has wrong length (${group.length})` };
    }
    for (const ch of group) {
      if (!ALPHABET_SET.has(ch)) {
        return { valid: false, reason: `group ${g + 1} has illegal character "${ch}"` };
      }
    }
    const payload = group.slice(0, PAYLOAD_PER_GROUP);
    const expected = checksumChar(payload, g, prefix);
    if (group[PAYLOAD_PER_GROUP] !== expected) {
      return { valid: false, reason: `group ${g + 1} checksum mismatch` };
    }
  }

  return { valid: true, prefix, groups, canonical: `${prefix}-${groups.join('-')}` };
}

/** Returns the canonical (normalized, validated) license key, or null if invalid. */
export function normalizeLicenseKey(key: string): string | null {
  const validation = validateLicenseKey(key);
  return validation.valid ? validation.canonical : null;
}
