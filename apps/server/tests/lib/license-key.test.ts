import { describe, it, expect } from 'vitest';
import {
  canonicalizePrefix,
  generateLicenseKey,
  normalizeLicenseKey,
  validateLicenseKey,
} from '../../src/lib/license/license-key';

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

  it('rejects a key with a flipped character', () => {
    const key = generateLicenseKey('TROP');
    // Flip one payload char in group 1 (index 5: just after "TR0P-")
    const flippedChar = key[5] === 'A' ? 'B' : 'A';
    const broken = key.slice(0, 5) + flippedChar + key.slice(6);
    expect(validateLicenseKey(broken).valid).toBe(false);
  });

  it('rejects a key with two groups swapped', () => {
    const key = generateLicenseKey('TROP');
    // Original: PREFIX-G1-G2-G3-G4 → swap G2 and G3
    const parts = key.split('-');
    [parts[2], parts[3]] = [parts[3]!, parts[2]!];
    const swapped = parts.join('-');
    expect(validateLicenseKey(swapped).valid).toBe(false);
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
