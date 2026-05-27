import { getEnv } from '../env';
import { EnvKeyProvider } from './env-key-provider';
import { FileKeyProvider } from './file-key-provider';
import type { KeyProvider } from './key-provider';

export type { KeyProvider } from './key-provider';

let cached: KeyProvider | undefined;

/**
 * Returns the configured KeyProvider.
 * Resolution order: ENCRYPTION_KEY_FILE > ENCRYPTION_KEY.
 * If both are set, file wins — file is the more deploy-friendly form
 * and we want a single source of truth.
 */
export function getKeyProvider(): KeyProvider {
  if (cached) return cached;
  const env = getEnv();

  if (env.ENCRYPTION_KEY_FILE) {
    cached = new FileKeyProvider(env.ENCRYPTION_KEY_FILE);
  } else if (env.ENCRYPTION_KEY) {
    cached = new EnvKeyProvider(env.ENCRYPTION_KEY);
  } else {
    // Should be unreachable — env.ts refuses to validate without one of them.
    throw new Error('No encryption key configured (ENCRYPTION_KEY or ENCRYPTION_KEY_FILE).');
  }

  return cached;
}
