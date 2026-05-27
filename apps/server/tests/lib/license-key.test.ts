import { describe, it, expect } from 'vitest';
import {
  canonicalizePrefix,
  generateLicenseKey,
  normalizeLicenseKey,
  validateLicenseKey,
} from '../../src/lib/license/license-key';

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

describe('canonicalizePrefix', () => {
  it('uppercases input', () => {
    expect(canonicalizePrefix('trop')).toBe('TR0P');
  });

  it('maps O→0, I→1, L→1, U→V (Crockford)', () => {
    expect(canonicalizePrefix('TROP')).toBe('TR0P');
    expect(canonicalizePrefix('TRIP')).toBe('TR1P');
    expect(canonicalizePrefix('TROLL')).toBe('TR011');
    expect(canonicalizePrefix('USER')).toBe('VSER');
  });

  it('trims whitespace', () => {
    expect(canonicalizePrefix('  TROP  ')).toBe('TR0P');
  });

  it('rejects empty input', () => {
    expect(() => canonicalizePrefix('')).toThrow(/must not be empty/);
    expect(() => canonicalizePrefix('   ')).toThrow(/must not be empty/);
  });

  it('rejects illegal characters after normalization', () => {
    expect(() => canonicalizePrefix('TR$P')).toThrow(/illegal character/);
  });
});

describe('generateLicenseKey', () => {
  it('produces a key matching the expected format', () => {
    const key = generateLicenseKey('TROP');
    expect(key).toMatch(/^TR0P(-[0-9A-HJKMNP-TV-Z]{4}){4}$/);
  });

  it('canonicalizes the prefix to Crockford form', () => {
    expect(generateLicenseKey('TROP').startsWith('TR0P-')).toBe(true);
    expect(generateLicenseKey('trop').startsWith('TR0P-')).toBe(true);
  });

  it('rejects an empty prefix', () => {
    expect(() => generateLicenseKey('')).toThrow(/must not be empty/);
  });

  it('produces 100 unique keys in a row (sanity check on randomness)', () => {
    const keys = new Set<string>();
    for (let i = 0; i < 100; i++) {
      keys.add(generateLicenseKey('TROP'));
    }
    expect(keys.size).toBe(100);
  });
});

describe('validateLicenseKey', () => {
  it('accepts a freshly generated key', () => {
    for (let i = 0; i < 20; i++) {
      const key = generateLicenseKey('TROP');
      const result = validateLicenseKey(key);
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.prefix).toBe('TR0P');
        expect(result.groups).toHaveLength(4);
        expect(result.canonical).toBe(key);
      }
    }
  });

  it('accepts case-insensitive input', () => {
    const key = generateLicenseKey('TROP');
    expect(validateLicenseKey(key.toLowerCase()).valid).toBe(true);
  });

  it('accepts input that uses O instead of 0 (Crockford fallback)', () => {
    const key = generateLicenseKey('TROP'); // starts with TR0P
    const typed = key.replace(/0/g, 'O');
    const result = validateLicenseKey(typed);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.canonical).toBe(key); // canonicalized back to 0
    }
  });

  it('trims surrounding whitespace', () => {
    const key = generateLicenseKey('TROP');
    expect(validateLicenseKey(`  ${key}\n`).valid).toBe(true);
  });

  it('rejects a key with wrong group count', () => {
    expect(validateLicenseKey('TR0P-AAAA-AAAA-AAAA').valid).toBe(false);
    expect(validateLicenseKey('TR0P-AAAA-AAAA-AAAA-AAAA-AAAA').valid).toBe(false);
  });

  it('rejects non-string input', () => {
    // @ts-expect-error testing runtime guard
    expect(validateLicenseKey(null).valid).toBe(false);
    // @ts-expect-error testing runtime guard
    expect(validateLicenseKey(undefined).valid).toBe(false);
    // @ts-expect-error testing runtime guard
    expect(validateLicenseKey(12345).valid).toBe(false);
  });

  it('rejects a key whose prefix was tampered', () => {
    const key = generateLicenseKey('TROP');
    // Change TR0P → TS0P → checksum no longer matches
    const tamperedPrefix = 'TS0P' + key.slice(4);
    expect(validateLicenseKey(tamperedPrefix).valid).toBe(false);
  });
});

// Deterministic checksum-strength tests: no randomness in the failure
// dimension itself. Each generated key is exhaustively probed against all
// possible single-character substitutions in every payload position, and
// every group-swap permutation. The Damm algorithm guarantees these are
// all detected.
describe('validateLicenseKey – Damm strength guarantees', () => {
  const KEYS_PER_RUN = 100;

  it('rejects every single-character payload flip across 100 keys × all groups × all positions × all alphabet substitutions', () => {
    for (let k = 0; k < KEYS_PER_RUN; k++) {
      const key = generateLicenseKey('TROP');
      // key layout: PREFIX-G1-G2-G3-G4. Group g starts at offset 5 + 5*g.
      // Within each 4-char group, payload positions are local indices 0..2.
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
                `Single-char flip undetected: key=${key} group=${g + 1} pos=${pos} ${original}→${sub} produced ${flipped}`,
              );
            }
            expect(result.valid).toBe(false);
          }
        }
      }
    }
  });

  it('rejects every single-character check-char flip across 100 keys × all groups × all alphabet substitutions', () => {
    for (let k = 0; k < KEYS_PER_RUN; k++) {
      const key = generateLicenseKey('TROP');
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
      const key = generateLicenseKey('TROP');
      const parts = key.split('-');
      for (const [a, b] of pairs) {
        const swapped = parts.slice();
        const ga = swapped[1 + a]!;
        const gb = swapped[1 + b]!;
        if (ga === gb) continue; // astronomically unlikely but skip
        swapped[1 + a] = gb;
        swapped[1 + b] = ga;
        const result = validateLicenseKey(swapped.join('-'));
        expect(result.valid).toBe(false);
      }
    }
  });

  it('rejects adjacent transpositions within payload (Damm guarantee)', () => {
    for (let k = 0; k < 100; k++) {
      const key = generateLicenseKey('TROP');
      for (let g = 0; g < 4; g++) {
        const groupStart = 5 + 5 * g;
        // Transposition pos↔pos+1 within payload (positions 0..2). So pairs (0,1) and (1,2).
        for (let pos = 0; pos < 2; pos++) {
          const i = groupStart + pos;
          const j = groupStart + pos + 1;
          if (key[i] === key[j]) continue; // identical chars → no-op
          const chars = key.split('');
          [chars[i], chars[j]] = [chars[j]!, chars[i]!];
          const transposed = chars.join('');
          expect(validateLicenseKey(transposed).valid).toBe(false);
        }
      }
    }
  });
});

describe('normalizeLicenseKey', () => {
  it('returns canonical form for a valid key', () => {
    const key = generateLicenseKey('TROP');
    expect(normalizeLicenseKey(key.toLowerCase())).toBe(key);
  });

  it('returns null for an invalid key', () => {
    expect(normalizeLicenseKey('not-a-key')).toBeNull();
  });

  it('preserves the canonical key through round-trip', () => {
    const key = generateLicenseKey('MUEL');
    expect(normalizeLicenseKey(key)).toBe(key);
  });
});
