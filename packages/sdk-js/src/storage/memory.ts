import type { StorageAdapter } from '../types';

/**
 * In-memory storage adapter. State is lost on process restart — useful for
 * tests, short-lived processes, or as a fallback when no persistent storage
 * is available.
 */
export function createMemoryStorage(): StorageAdapter {
  const store = new Map<string, string>();
  return {
    async get(key: string) {
      return store.get(key) ?? null;
    },
    async set(key: string, value: string) {
      store.set(key, value);
    },
    async delete(key: string) {
      store.delete(key);
    },
  };
}
