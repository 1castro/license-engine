import { describe, it, expect, beforeAll, vi } from 'vitest';

beforeAll(() => {
  process.env.DATABASE_URL ??= 'postgresql://x:x@localhost:5432/x?schema=public';
  process.env.APP_BASE_URL ??= 'http://localhost:3000';
  process.env.JWT_ISSUER ??= 'license.test';
  process.env.NEXTAUTH_SECRET ??= 'test-secret-must-be-at-least-32-characters-long-yes';
  process.env.NEXTAUTH_URL ??= 'http://localhost:3000';
  // Deterministic 32-byte key for the KEK so the test is stable.
  process.env.ENCRYPTION_KEY = Buffer.from(new Uint8Array(32).fill(0x42)).toString('base64');
});

describe('envelope encryption (AES-256-GCM)', () => {
  it('roundtrips arbitrary plaintext', async () => {
    const { envelopeEncrypt, envelopeDecrypt } = await import('../../src/lib/crypto/envelope');
    const original = new TextEncoder().encode('the quick brown fox jumps over the lazy dog');
    const encoded = await envelopeEncrypt(original);
    const decoded = await envelopeDecrypt(encoded);
    expect(new TextDecoder().decode(decoded)).toBe(
      'the quick brown fox jumps over the lazy dog',
    );
  });

  it('produces different ciphertexts for the same plaintext (random nonce)', async () => {
    const { envelopeEncrypt } = await import('../../src/lib/crypto/envelope');
    const plain = new TextEncoder().encode('repeat me');
    const a = await envelopeEncrypt(plain);
    const b = await envelopeEncrypt(plain);
    expect(a).not.toBe(b);
  });

  it('rejects a tampered tag', async () => {
    const { envelopeEncrypt, envelopeDecrypt } = await import('../../src/lib/crypto/envelope');
    const encoded = await envelopeEncrypt(new TextEncoder().encode('sensitive'));
    const blob = Buffer.from(encoded, 'base64');
    blob[blob.length - 1] ^= 0x01; // flip a bit in the auth tag
    const tampered = blob.toString('base64');
    await expect(envelopeDecrypt(tampered)).rejects.toThrow();
  });

  it('rejects a tampered ciphertext', async () => {
    const { envelopeEncrypt, envelopeDecrypt } = await import('../../src/lib/crypto/envelope');
    const encoded = await envelopeEncrypt(new TextEncoder().encode('sensitive payload'));
    const blob = Buffer.from(encoded, 'base64');
    // Flip a bit in the ciphertext (after 12-byte nonce, before 16-byte tag).
    blob[15] ^= 0x01;
    const tampered = blob.toString('base64');
    await expect(envelopeDecrypt(tampered)).rejects.toThrow();
  });

  it('rejects a blob that is too short', async () => {
    const { envelopeDecrypt } = await import('../../src/lib/crypto/envelope');
    const short = Buffer.from(new Uint8Array(10)).toString('base64');
    await expect(envelopeDecrypt(short)).rejects.toThrow(/too short/);
  });
});
