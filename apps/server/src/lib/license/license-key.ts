import { randomBytes } from 'node:crypto';

/**
 * License-key format: `PREFIX-XXXX-XXXX-XXXX-XXXX`.
 *
 * Per group of 4 characters: the first 3 are payload, the 4th is a check char.
 * Alphabet is Crockford Base32 (32 chars, no I/L/O/U).
 *
 * Crockford normalization is applied transparently to user input:
 *   O → 0, I → 1, L → 1, U → V
 * So a prefix like "TROP" is stored canonically as "TR0P", and a typed key
 * with O or I is accepted as if the user had typed the canonical form.
 *
 * Check-char algorithm: Damm's algorithm generalised to a 32-symbol alphabet.
 * Damm uses a totally anti-symmetric quasigroup with zero diagonal, which
 * provably detects ALL single-character substitutions and ALL adjacent
 * transpositions in the input sequence — no per-position weighting needed.
 *
 * The order-32 TA quasigroup is built at module load time as the direct
 * product of a known order-4 and order-8 TA quasigroup (both with diagonal
 * zero, both verified). Direct product of two TA quasigroups is again a
 * TA quasigroup (standard result, Damm 2004, Sec. 5.2). A self-check at
 * load time asserts Latin-square property, zero diagonal, and TA property.
 *
 * The check char is computed over the sequence
 *   [prefix chars..., groupIndex, payload chars...]
 * each mapped to its alphabet index (groupIndex is used directly, 0..3).
 * Folding the prefix and group index into the per-group check guarantees:
 *   - tampered prefix is detected (prefix chars feed every group's checksum),
 *   - swapped groups are detected (different group index → different check),
 *   - single-char typos anywhere in payload are detected (Damm guarantee),
 *   - adjacent transpositions within payload are detected (Damm guarantee).
 *
 * This is not a cryptographic check — it's a UX safety net to catch typos
 * before they hit the server. Server-side, the key is looked up by exact
 * match against the DB.
 */

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const ALPHABET_SET = new Set(ALPHABET.split(''));
const GROUP_COUNT = 4;
const GROUP_SIZE = 4;
const PAYLOAD_PER_GROUP = GROUP_SIZE - 1;

// --- Damm-Tabelle für 32-Alphabet ------------------------------------------

/**
 * Order-4 TA quasigroup with zero diagonal (one of the two existing
 * isomorphism classes, found by exhaustive enumeration).
 */
const TA_ORDER_4: readonly (readonly number[])[] = [
  [0, 2, 3, 1],
  [2, 0, 1, 3],
  [3, 1, 0, 2],
  [1, 3, 2, 0],
];

/**
 * Order-8 TA quasigroup with zero diagonal (found by a deterministic search
 * and committed as a constant — the search itself is not run at runtime).
 */
const TA_ORDER_8: readonly (readonly number[])[] = [
  [0, 7, 3, 5, 2, 6, 1, 4],
  [7, 0, 5, 6, 1, 4, 2, 3],
  [3, 4, 0, 7, 6, 2, 5, 1],
  [5, 6, 1, 0, 4, 7, 3, 2],
  [2, 1, 6, 4, 0, 3, 7, 5],
  [6, 5, 2, 1, 3, 0, 4, 7],
  [1, 2, 4, 3, 7, 5, 0, 6],
  [4, 3, 7, 2, 5, 1, 6, 0],
];

/**
 * Builds the order-32 Damm quasigroup as direct product of TA_ORDER_4
 * and TA_ORDER_8. Encoding: a value z ∈ [0,32) is the pair (a, b) with
 * a = z div 8 ∈ [0,4), b = z mod 8 ∈ [0,8).
 * Operation: (a1,b1) ⊕ (a2,b2) = (T4[a1][a2], T8[b1][b2]).
 */
function buildDammTable(): readonly (readonly number[])[] {
  const table: number[][] = [];
  for (let z1 = 0; z1 < 32; z1++) {
    const row: number[] = [];
    const a1 = Math.floor(z1 / 8);
    const b1 = z1 % 8;
    for (let z2 = 0; z2 < 32; z2++) {
      const a2 = Math.floor(z2 / 8);
      const b2 = z2 % 8;
      row.push(8 * TA_ORDER_4[a1]![a2]! + TA_ORDER_8[b1]![b2]!);
    }
    table.push(row);
  }
  return table;
}

/**
 * Self-check that the generated table satisfies all properties Damm needs:
 *   - Latin square (every row and column is a permutation of [0..31])
 *   - zero diagonal (Q(x, x) = 0 for all x)
 *   - total anti-symmetry: for all c, x, y with x ≠ y, Q(Q(c,x),y) ≠ Q(Q(c,y),x)
 *
 * Runs once at module load. If the table is corrupt the module fails to
 * import — better than silently producing weak check chars.
 */
function assertTAQuasigroup(table: readonly (readonly number[])[]): void {
  const n = 32;
  for (let i = 0; i < n; i++) {
    const rowSeen = new Set<number>();
    const colSeen = new Set<number>();
    for (let j = 0; j < n; j++) {
      rowSeen.add(table[i]![j]!);
      colSeen.add(table[j]![i]!);
    }
    if (rowSeen.size !== n || colSeen.size !== n) {
      throw new Error(`Damm table is not a Latin square (row/col ${i})`);
    }
    if (table[i]![i] !== 0) {
      throw new Error(`Damm table diagonal[${i}] is ${table[i]![i]}, expected 0`);
    }
  }
  for (let c = 0; c < n; c++) {
    for (let x = 0; x < n; x++) {
      for (let y = x + 1; y < n; y++) {
        if (table[table[c]![x]!]![y] === table[table[c]![y]!]![x]) {
          throw new Error(`Damm table fails TA property at c=${c}, x=${x}, y=${y}`);
        }
      }
    }
  }
}

const DAMM_TABLE: readonly (readonly number[])[] = buildDammTable();
assertTAQuasigroup(DAMM_TABLE);

// --- Crockford-Normalisierung & Alphabet-Helpers ---------------------------

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

/**
 * Computes the Damm check char over [prefix..., groupIndex, payload...].
 * Each element is fed through the quasigroup table as Damm's algorithm
 * prescribes: interim = Q[interim][digit], starting from interim = 0.
 * The final interim value (0..31) maps back to an alphabet char.
 */
function checksumChar(payload: string, groupIndex: number, prefix: string): string {
  let interim = 0;
  for (let i = 0; i < prefix.length; i++) {
    interim = DAMM_TABLE[interim]![indexOfChar(prefix[i]!)]!;
  }
  interim = DAMM_TABLE[interim]![groupIndex]!;
  for (let i = 0; i < payload.length; i++) {
    interim = DAMM_TABLE[interim]![indexOfChar(payload[i]!)]!;
  }
  return ALPHABET[interim]!;
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
