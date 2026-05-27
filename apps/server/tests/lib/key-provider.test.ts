import { describe, it, expect } from 'vitest';
import { decodeKeyMaterial } from '../../src/lib/crypto/key-provider';
import { EnvKeyProvider } from '../../src/lib/crypto/env-key-provider';

const validBase64 = Buffer.from(new Uint8Array(32).fill(0xab)).toString('base64');

describe('decodeKeyMaterial', () => {
  it('decodes a valid 32-byte base64 key', () => {
    const bytes = decodeKeyMaterial(validBase64, 'test');
    expect(bytes.byteLength).toBe(32);
  });

  it('rejects empty input', () => {
    expect(() => decodeKeyMaterial('', 'test')).toThrow(/empty/);
  });

  it('rejects keys shorter than 32 bytes', () => {
    const short = Buffer.from(new Uint8Array(16)).toString('base64');
    expect(() => decodeKeyMaterial(short, 'test')).toThrow(/32 bytes/);
  });

  it('rejects keys longer than 32 bytes', () => {
    const long = Buffer.from(new Uint8Array(64)).toString('base64');
    expect(() => decodeKeyMaterial(long, 'test')).toThrow(/32 bytes/);
  });

  it('trims surrounding whitespace before decoding', () => {
    const bytes = decodeKeyMaterial(`  ${validBase64}\n`, 'test');
    expect(bytes.byteLength).toBe(32);
  });
});

describe('EnvKeyProvider', () => {
  it('returns the same key bytes on repeated calls (caches)', async () => {
    const p = new EnvKeyProvider(validBase64);
    const a = await p.getEncryptionKey();
    const b = await p.getEncryptionKey();
    expect(a).toBe(b);
  });

  it('exposes its source as env:ENCRYPTION_KEY', () => {
    const p = new EnvKeyProvider(validBase64);
    expect(p.source).toBe('env:ENCRYPTION_KEY');
  });
});
