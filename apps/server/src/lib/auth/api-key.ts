import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * API-Key format and lifecycle.
 *
 * Format:  `lek_<32-char-base64url>` — `lek` stands for License Engine Key.
 * The 32-char body encodes 192 bits of entropy; no per-key salt is needed
 * because that entropy alone defeats brute-force against the hash.
 *
 * Storage:
 *   - Plaintext is shown exactly once at creation time (via API response).
 *   - DB stores the SHA-256 hex digest in `ApiKey.keyHash` (UNIQUE).
 *   - Plaintext lookup at auth time = SHA-256(plaintext) + indexed equality lookup.
 *
 * SHA-256 is chosen over argon2id because the key has uniform high entropy:
 * even with the full digest leaked, an attacker has no faster path than
 * 2^192 brute-force. Argon2 would just slow legitimate requests for no
 * additional defense.
 */

const PLAINTEXT_PREFIX = 'lek_';
const BODY_BYTE_LENGTH = 24; // 24 bytes → 32 base64url chars without padding
const PLAINTEXT_LENGTH = PLAINTEXT_PREFIX.length + 32;
const PLAINTEXT_RE = new RegExp(`^${PLAINTEXT_PREFIX}[A-Za-z0-9_-]{32}$`);

export interface GeneratedApiKey {
  /** Shown to the operator once; never stored in plaintext. */
  plaintext: string;
  /** SHA-256 hex digest, stored as ApiKey.keyHash. */
  hash: string;
}

/** Generates a fresh API key. */
export function generateApiKey(): GeneratedApiKey {
  const body = randomBytes(BODY_BYTE_LENGTH).toString('base64url');
  const plaintext = `${PLAINTEXT_PREFIX}${body}`;
  return { plaintext, hash: hashApiKey(plaintext) };
}

/** Deterministic hash for an API-key plaintext. */
export function hashApiKey(plaintext: string): string {
  return createHash('sha256').update(plaintext, 'utf8').digest('hex');
}

/**
 * Constant-time comparison helper for digests. Avoids early-exit timing leaks
 * if a caller compares hashes outside of a DB-indexed lookup.
 */
export function safeEqualHashes(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
}

/** Returns true if the plaintext matches the expected format. */
export function isValidApiKeyFormat(plaintext: unknown): plaintext is string {
  return typeof plaintext === 'string' && plaintext.length === PLAINTEXT_LENGTH && PLAINTEXT_RE.test(plaintext);
}
