/**
 * KeyProvider — abstract source for the Master Encryption Key (KEK).
 *
 * The KEK is used to encrypt SigningKey.privateKeyEncrypted in the database.
 * It must never appear in logs, errors, or be persisted outside its source.
 *
 * Tag-1 implementations: EnvKeyProvider, FileKeyProvider.
 * Later: KMS-backed providers (Vault, AWS KMS, …) implement this same interface
 * without touching call-sites.
 */
export interface KeyProvider {
  /** Returns the 32-byte master encryption key. */
  getEncryptionKey(): Promise<Uint8Array>;
  /** Stable identifier of the provider for logs / health output. */
  readonly source: string;
}

const KEY_BYTE_LENGTH = 32;

/**
 * Decodes a base64 string into exactly 32 bytes. Throws otherwise.
 * Strict length check — partial keys must fail loudly, not silently weaken crypto.
 */
export function decodeKeyMaterial(input: string, source: string): Uint8Array {
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    throw new Error(`KeyProvider(${source}): key material is empty`);
  }
  let buffer: Buffer;
  try {
    buffer = Buffer.from(trimmed, 'base64');
  } catch {
    throw new Error(`KeyProvider(${source}): key material is not valid base64`);
  }
  if (buffer.byteLength !== KEY_BYTE_LENGTH) {
    throw new Error(
      `KeyProvider(${source}): expected ${KEY_BYTE_LENGTH} bytes after base64-decode, got ${buffer.byteLength}`,
    );
  }
  return new Uint8Array(buffer);
}
