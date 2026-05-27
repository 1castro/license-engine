import { readFile, stat } from 'node:fs/promises';
import { decodeKeyMaterial, type KeyProvider } from './key-provider';

export class FileKeyProvider implements KeyProvider {
  readonly source: string;
  private cached: Uint8Array | undefined;

  constructor(private readonly path: string) {
    this.source = `file:${path}`;
  }

  async getEncryptionKey(): Promise<Uint8Array> {
    if (this.cached) return this.cached;

    // Refuse world-readable key files — small but cheap defense against careless deploys.
    const info = await stat(this.path);
    const mode = info.mode & 0o777;
    if ((mode & 0o077) !== 0 && process.env.NODE_ENV === 'production') {
      throw new Error(
        `KeyProvider(${this.source}): key file mode ${mode.toString(8)} is too permissive; expected 0600 or stricter`,
      );
    }

    const contents = await readFile(this.path, 'utf-8');
    this.cached = decodeKeyMaterial(contents, this.source);
    return this.cached;
  }
}
