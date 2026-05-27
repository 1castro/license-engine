import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import type { StorageAdapter } from '../types';

export interface FileSystemStorageOptions {
  /**
   * Directory where license state is stored. Defaults to
   * `~/.config/<productSlug>/license` on Linux/macOS — pass `productSlug` to
   * pick the per-product subdirectory.
   *
   * On a per-installation basis, every key becomes a file in this directory.
   * The directory is created on first write if it doesn't exist.
   */
  directory?: string;
  productSlug?: string;
}

function defaultDirectory(productSlug?: string): string {
  const base = process.env.LICENSE_ENGINE_STATE_DIR ?? join(homedir(), '.config');
  return productSlug ? join(base, 'license-engine', productSlug) : join(base, 'license-engine');
}

function sanitizeKey(key: string): string {
  // Keys are server-controlled strings (e.g. "license-token", "public-keys");
  // belt-and-suspenders: refuse anything that could escape the directory.
  if (!/^[a-zA-Z0-9._-]+$/.test(key)) {
    throw new Error(`Storage key contains illegal characters: ${key}`);
  }
  return key;
}

/**
 * Filesystem-backed storage for Node — one file per key, mode 0600.
 */
export function createFileSystemStorage(options: FileSystemStorageOptions = {}): StorageAdapter {
  const dir = options.directory ?? defaultDirectory(options.productSlug);

  async function pathFor(key: string): Promise<string> {
    return join(dir, sanitizeKey(key));
  }

  return {
    async get(key: string) {
      try {
        const data = await readFile(await pathFor(key), 'utf8');
        return data;
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
        throw err;
      }
    },
    async set(key: string, value: string) {
      const path = await pathFor(key);
      await mkdir(dirname(path), { recursive: true, mode: 0o700 });
      await writeFile(path, value, { mode: 0o600, encoding: 'utf8' });
    },
    async delete(key: string) {
      try {
        await unlink(await pathFor(key));
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') return;
        throw err;
      }
    },
  };
}
