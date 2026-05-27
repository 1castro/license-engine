import { describe, it, expect } from 'vitest';
import {
  generateApiKey,
  hashApiKey,
  isValidApiKeyFormat,
  safeEqualHashes,
} from '../../src/lib/auth/api-key';

describe('generateApiKey', () => {
  it('produces a key with the lek_ prefix and 32 base64url chars', () => {
    const { plaintext, hash } = generateApiKey();
    expect(plaintext).toMatch(/^lek_[A-Za-z0-9_-]{32}$/);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('produces unique keys across many calls', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      seen.add(generateApiKey().plaintext);
    }
    expect(seen.size).toBe(200);
  });

  it('hash matches a fresh hashApiKey call', () => {
    const { plaintext, hash } = generateApiKey();
    expect(hashApiKey(plaintext)).toBe(hash);
  });
});

describe('hashApiKey', () => {
  it('is deterministic', () => {
    expect(hashApiKey('lek_abc')).toBe(hashApiKey('lek_abc'));
  });

  it('produces different hashes for different inputs', () => {
    expect(hashApiKey('lek_a')).not.toBe(hashApiKey('lek_b'));
  });

  it('does not include the plaintext in the digest', () => {
    const digest = hashApiKey('lek_abcdef0123456789');
    expect(digest).not.toContain('abcdef');
  });
});

describe('isValidApiKeyFormat', () => {
  it('accepts a freshly generated key', () => {
    const { plaintext } = generateApiKey();
    expect(isValidApiKeyFormat(plaintext)).toBe(true);
  });

  it('rejects wrong prefix', () => {
    expect(isValidApiKeyFormat('xxx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')).toBe(false);
  });

  it('rejects too short', () => {
    expect(isValidApiKeyFormat('lek_short')).toBe(false);
  });

  it('rejects illegal characters', () => {
    expect(isValidApiKeyFormat('lek_!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!')).toBe(false);
  });

  it('rejects non-string', () => {
    expect(isValidApiKeyFormat(null)).toBe(false);
    expect(isValidApiKeyFormat(undefined)).toBe(false);
    expect(isValidApiKeyFormat(12345)).toBe(false);
  });
});

describe('safeEqualHashes', () => {
  it('returns true for equal strings', () => {
    expect(safeEqualHashes('abc', 'abc')).toBe(true);
  });

  it('returns false for unequal strings', () => {
    expect(safeEqualHashes('abc', 'abd')).toBe(false);
  });

  it('returns false for different lengths (no throw)', () => {
    expect(safeEqualHashes('abc', 'abcd')).toBe(false);
  });
});
