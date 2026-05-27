import type { StorageAdapter } from '../types';

/**
 * IndexedDB-backed storage for the browser. One database with one object
 * store ("kv") keyed by string, value = string.
 *
 * Falls back to localStorage if IndexedDB is unavailable (e.g. private mode
 * in some browsers).
 */

const DEFAULT_DB_NAME = 'license-engine';
const STORE = 'kv';

function openDb(dbName: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(dbName, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
  });
}

function tx<T>(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  op: (store: IDBObjectStore) => IDBRequest<T> | void,
): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const store = t.objectStore(STORE);
    let result: T | undefined;
    const r = op(store);
    if (r) {
      r.onsuccess = () => {
        result = r.result;
      };
    }
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error ?? new Error('IndexedDB tx failed'));
    t.onabort = () => reject(t.error ?? new Error('IndexedDB tx aborted'));
  });
}

function createLocalStorageFallback(): StorageAdapter {
  const prefix = 'license-engine:';
  return {
    async get(key: string) {
      return localStorage.getItem(prefix + key);
    },
    async set(key: string, value: string) {
      localStorage.setItem(prefix + key, value);
    },
    async delete(key: string) {
      localStorage.removeItem(prefix + key);
    },
  };
}

export function createIndexedDbStorage(dbName: string = DEFAULT_DB_NAME): StorageAdapter {
  if (typeof indexedDB === 'undefined') {
    return createLocalStorageFallback();
  }
  let dbPromise: Promise<IDBDatabase> | null = null;
  function ensureDb(): Promise<IDBDatabase> {
    return (dbPromise ??= openDb(dbName));
  }

  return {
    async get(key: string) {
      const db = await ensureDb();
      const value = await tx<string | undefined>(db, 'readonly', (store) => store.get(key));
      return value ?? null;
    },
    async set(key: string, value: string) {
      const db = await ensureDb();
      await tx<IDBValidKey>(db, 'readwrite', (store) => store.put(value, key));
    },
    async delete(key: string) {
      const db = await ensureDb();
      await tx<undefined>(db, 'readwrite', (store) => store.delete(key));
    },
  };
}
