import { describe, it, expect } from 'vitest';
import { normalizeLicenseKey, validateLicenseKey } from '../src/license-key';

// SDK-side license-key validator. Mirrors the server-side tests in
// apps/server/tests/lib/license-key.test.ts (minus the prefix-canonicalize
// helper, which is server-only).
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

  it('accepts a well-formed canonical key (TR0P-VMY6-HKMY-BRXP-19X4 from Phase 2)', () => {
    const res = validateLicenseKey('TR0P-VMY6-HKMY-BRXP-19X4');
    expect(res.valid).toBe(true);
    if (res.valid) {
      expect(res.canonical).toBe('TR0P-VMY6-HKMY-BRXP-19X4');
      expect(res.prefix).toBe('TR0P');
      expect(res.groups).toHaveLength(4);
    }
  });

  it('normalizes typed O/I/L/U to canonical 0/1/1/V', () => {
    // User types TROP instead of TR0P (O instead of 0) — should still match.
    const res = validateLicenseKey('trop-vmy6-hkmy-brxp-19x4');
    expect(res.valid).toBe(true);
    if (res.valid) {
      expect(res.canonical).toBe('TR0P-VMY6-HKMY-BRXP-19X4');
    }
  });

  it('rejects a key with a flipped checksum char', () => {
    // Phase-2 key with last char of last group changed
    const broken = 'TR0P-VMY6-HKMY-BRXP-19X5';
    expect(validateLicenseKey(broken).valid).toBe(false);
  });

  it('returns canonical form via normalizeLicenseKey, or null', () => {
    expect(normalizeLicenseKey('TROP-VMY6-HKMY-BRXP-19X4')).toBe('TR0P-VMY6-HKMY-BRXP-19X4');
    expect(normalizeLicenseKey('garbage')).toBeNull();
  });
});
