/**
 * License-key format validator — mirrors the server-side implementation
 * in apps/server/src/lib/license/license-key.ts.
 *
 * Kept duplicated rather than shared, so the SDK has zero server dependencies
 * and ships as a tiny package. The two implementations must stay in sync.
 *
 * Check-char algorithm: Damm's algorithm over a totally anti-symmetric
 * quasigroup of order 32 (zero diagonal). The table is constructed at module
 * load time as the direct product of an order-4 and an order-8 TA quasigroup
 * (constants below); a self-check verifies Latin-square, zero-diagonal and
 * TA properties on import. See server-side module for the design rationale.
 */

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const ALPHABET_SET = new Set(ALPHABET.split(''));
const GROUP_COUNT = 4;
const GROUP_SIZE = 4;
const PAYLOAD_PER_GROUP = GROUP_SIZE - 1;

const TA_ORDER_4: readonly (readonly number[])[] = [
  [0, 2, 3, 1],
  [2, 0, 1, 3],
  [3, 1, 0, 2],
  [1, 3, 2, 0],
];

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
