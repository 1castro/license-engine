import { hash, verify } from '@node-rs/argon2';

// OWASP-recommended argon2id parameters for interactive login (2023+).
const ARGON2_OPTIONS = {
  memoryCost: 19_456, // 19 MiB
  timeCost: 2,
  outputLen: 32,
  parallelism: 1,
} as const;

export async function hashPassword(plain: string): Promise<string> {
  return hash(plain, ARGON2_OPTIONS);
}

/**
 * Constant-time password verification.
 * Returns false on any error (malformed hash, etc.) — never throws to the caller,
 * so auth flows can treat any failure uniformly without leaking timing.
 */
export async function verifyPassword(plain: string, encoded: string): Promise<boolean> {
  try {
    return await verify(encoded, plain);
  } catch {
    return false;
  }
}
