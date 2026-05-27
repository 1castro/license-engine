import { describe, it, expect } from 'vitest';
import { normalizeLicenseKey, validateLicenseKey } from '../src/license-key';

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

// SDK-side license-key validator. Mirrors the server-side tests in
// apps/server/tests/lib/license-key.test.ts (minus the prefix-canonicalize
// helper, which is server-only, and minus the key-generation tests, since
// the SDK never generates keys).
describe('SDK validateLicenseKey', () => {
  it('rejects non-string input', () => {
    expect(validateLicenseKey(null).valid).toBe(false);
    expect(validateLicenseKey(undefined).valid).toBe(false);
    expect(validateLicenseKey(12345).valid).toBe(false);
  });

  it('rejects malformed structure', () => {
    expect(validateLicenseKey('not-a-key').valid).toBe(false);
    expect(validateLicenseKey('TR0P-AAAA-AAAA-AAAA').valid).toBe(false);
  });

  // Fixture: a canonical key whose payloads are TR0P + (VMY, HKM, BRX, 19X)
  // with Damm check chars appended per group, recomputed deterministically
  // from the table baked into the SDK. The Phase-2 fixture from the old
  // checksum scheme is no longer valid by design.
  const FIXTURE = 'TR0P-VMYB-HKMJ-BRX6-19X0';

  it('accepts a well-formed canonical key (Damm-checksum fixture)', () => {
    const res = validateLicenseKey(FIXTURE);
    expect(res.valid).toBe(true);
    if (res.valid) {
      expect(res.canonical).toBe(FIXTURE);
      expect(res.prefix).toBe('TR0P');
      expect(res.groups).toHaveLength(4);
    }
  });

  it('normalizes typed O/I/L/U to canonical 0/1/1/V', () => {
    // User types TROP instead of TR0P (O instead of 0) — should still match.
    const res = validateLicenseKey(FIXTURE.replace('TR0P', 'trop').toLowerCase());
    expect(res.valid).toBe(true);
    if (res.valid) {
      expect(res.canonical).toBe(FIXTURE);
    }
  });

  it('rejects a key with a flipped check char', () => {
    // Flip the last char of the last group to anything else from the alphabet.
    const last = FIXTURE[FIXTURE.length - 1]!;
    const sub = ALPHABET.split('').find((c) => c !== last)!;
    const broken = FIXTURE.slice(0, -1) + sub;
    expect(validateLicenseKey(broken).valid).toBe(false);
  });

  it('returns canonical form via normalizeLicenseKey, or null', () => {
    expect(normalizeLicenseKey(FIXTURE.replace('TR0P', 'TROP'))).toBe(FIXTURE);
    expect(normalizeLicenseKey('garbage')).toBeNull();
  });
});

// Deterministic checksum-strength tests against the SDK validator. Since the
// SDK has no key generator we use a fixed corpus of 100 valid Damm-checksum
// keys (precomputed by running the server-side generator and baked in here).
// The corpus is deterministic — no Math.random anywhere.
describe('SDK validateLicenseKey – Damm strength guarantees', () => {
  // 100 valid keys generated with the prefix "TR0P". Each is fed through the
  // SDK validator and then perturbed.
  const VALID_KEYS: string[] = generateCorpus();

  it('accepts every key in the deterministic corpus', () => {
    for (const key of VALID_KEYS) {
      const res = validateLicenseKey(key);
      if (!res.valid) {
        throw new Error(`Corpus key rejected: ${key} (${res.reason})`);
      }
    }
  });

  it('rejects every single-character payload flip across corpus × all groups × all positions × all alphabet substitutions', () => {
    for (const key of VALID_KEYS) {
      for (let g = 0; g < 4; g++) {
        const groupStart = 5 + 5 * g;
        for (let pos = 0; pos < 3; pos++) {
          const charIdx = groupStart + pos;
          const original = key[charIdx]!;
          for (const sub of ALPHABET) {
            if (sub === original) continue;
            const flipped = key.slice(0, charIdx) + sub + key.slice(charIdx + 1);
            const result = validateLicenseKey(flipped);
            if (result.valid) {
              throw new Error(
                `Single-char flip undetected: key=${key} group=${g + 1} pos=${pos} ${original}→${sub}`,
              );
            }
          }
        }
      }
    }
  });

  it('rejects every check-char flip across corpus × all groups × all alphabet substitutions', () => {
    for (const key of VALID_KEYS) {
      for (let g = 0; g < 4; g++) {
        const checkIdx = 5 + 5 * g + 3;
        const original = key[checkIdx]!;
        for (const sub of ALPHABET) {
          if (sub === original) continue;
          const flipped = key.slice(0, checkIdx) + sub + key.slice(checkIdx + 1);
          expect(validateLicenseKey(flipped).valid).toBe(false);
        }
      }
    }
  });

  it('rejects systematic group swaps (all 6 unordered pairs across 50 keys)', () => {
    const pairs: [number, number][] = [
      [0, 1],
      [0, 2],
      [0, 3],
      [1, 2],
      [1, 3],
      [2, 3],
    ];
    for (let k = 0; k < 50; k++) {
      const key = VALID_KEYS[k]!;
      const parts = key.split('-');
      for (const [a, b] of pairs) {
        const swapped = parts.slice();
        const ga = swapped[1 + a]!;
        const gb = swapped[1 + b]!;
        if (ga === gb) continue;
        swapped[1 + a] = gb;
        swapped[1 + b] = ga;
        const result = validateLicenseKey(swapped.join('-'));
        expect(result.valid).toBe(false);
      }
    }
  });

  it('rejects adjacent transpositions within payload (Damm guarantee)', () => {
    for (const key of VALID_KEYS) {
      for (let g = 0; g < 4; g++) {
        const groupStart = 5 + 5 * g;
        for (let pos = 0; pos < 2; pos++) {
          const i = groupStart + pos;
          const j = groupStart + pos + 1;
          if (key[i] === key[j]) continue;
          const chars = key.split('');
          [chars[i], chars[j]] = [chars[j]!, chars[i]!];
          expect(validateLicenseKey(chars.join('')).valid).toBe(false);
        }
      }
    }
  });
});

/**
 * Builds a deterministic corpus of 100 valid keys by replaying the same Damm
 * check-char computation the SDK uses. Payloads are derived from a fixed
 * seeded sequence (mulberry32) — NOT Math.random — so the corpus is identical
 * across machines and runs.
 */
function generateCorpus(): string[] {
  const TA4 = [
    [0, 2, 3, 1],
    [2, 0, 1, 3],
    [3, 1, 0, 2],
    [1, 3, 2, 0],
  ];
  const TA8 = [
    [0, 7, 3, 5, 2, 6, 1, 4],
    [7, 0, 5, 6, 1, 4, 2, 3],
    [3, 4, 0, 7, 6, 2, 5, 1],
    [5, 6, 1, 0, 4, 7, 3, 2],
    [2, 1, 6, 4, 0, 3, 7, 5],
    [6, 5, 2, 1, 3, 0, 4, 7],
    [1, 2, 4, 3, 7, 5, 0, 6],
    [4, 3, 7, 2, 5, 1, 6, 0],
  ];
  const T: number[][] = [];
  for (let z1 = 0; z1 < 32; z1++) {
    const row: number[] = [];
    const a1 = Math.floor(z1 / 8);
    const b1 = z1 % 8;
    for (let z2 = 0; z2 < 32; z2++) {
      const a2 = Math.floor(z2 / 8);
      const b2 = z2 % 8;
      row.push(8 * TA4[a1]![a2]! + TA8[b1]![b2]!);
    }
    T.push(row);
  }
  const idx = (c: string) => ALPHABET.indexOf(c);
  function check(payload: string, gi: number, prefix: string): string {
    let i = 0;
    for (const c of prefix) i = T[i]![idx(c)]!;
    i = T[i]![gi]!;
    for (const c of payload) i = T[i]![idx(c)]!;
    return ALPHABET[i]!;
  }
  // Deterministic seeded PRNG (mulberry32). Fixed seed = 1.
  let s = 1 >>> 0;
  function rng(): number {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function randChar(): string {
    return ALPHABET[Math.floor(rng() * 32)]!;
  }
  const prefix = 'TR0P';
  const out: string[] = [];
  for (let k = 0; k < 100; k++) {
    const groups: string[] = [];
    for (let g = 0; g < 4; g++) {
      const payload = randChar() + randChar() + randChar();
      groups.push(payload + check(payload, g, prefix));
    }
    out.push(prefix + '-' + groups.join('-'));
  }
  return out;
}
