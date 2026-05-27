import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { getKeyProvider } from './index';

/**
 * Envelope encryption for SigningKey.privateKeyEncrypted.
 *
 * Format (base64-encoded as a single string in the DB):
 *   nonce(12) | ciphertext(N) | tag(16)
 *
 * Algorithm: AES-256-GCM with the KEK from KeyProvider as the symmetric key.
 * GCM gives us authenticated encryption — any tamper with the ciphertext or
 * the tag fails decryption, so we don't need a separate integrity layer.
 */

const ALGORITHM = 'aes-256-gcm';
const NONCE_BYTES = 12;
const TAG_BYTES = 16;

export async function envelopeEncrypt(plaintext: Uint8Array): Promise<string> {
  const kek = await getKeyProvider().getEncryptionKey();
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv(ALGORITHM, kek, nonce);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([nonce, ciphertext, tag]).toString('base64');
}

export async function envelopeDecrypt(encoded: string): Promise<Uint8Array> {
  const blob = Buffer.from(encoded, 'base64');
  if (blob.byteLength < NONCE_BYTES + TAG_BYTES + 1) {
    throw new Error('Envelope blob too short to contain nonce + tag + at least one ciphertext byte');
  }
  const nonce = blob.subarray(0, NONCE_BYTES);
  const tag = blob.subarray(blob.byteLength - TAG_BYTES);
  const ciphertext = blob.subarray(NONCE_BYTES, blob.byteLength - TAG_BYTES);

  const kek = await getKeyProvider().getEncryptionKey();
  const decipher = createDecipheriv(ALGORITHM, kek, nonce);
  decipher.setAuthTag(tag);
  return new Uint8Array(Buffer.concat([decipher.update(ciphertext), decipher.final()]));
}
