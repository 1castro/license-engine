import { readFile, stat } from 'node:fs/promises';
import { getLogger } from '../logger';
import { decodeKeyMaterial, type KeyProvider } from './key-provider';

export class FileKeyProvider implements KeyProvider {
  readonly source: string;
  private cached: Uint8Array | undefined;

  constructor(private readonly path: string) {
    this.source = `file:${path}`;
  }

  async getEncryptionKey(): Promise<Uint8Array> {
    if (this.cached) return this.cached;

    // Enforce 0600-or-stricter on the key file. In production this is fatal;
    // in dev/test we still WARN loudly so the operator notices, but allow
    // boot — laptop file systems / volume mounts often grant the group read
    // bit by default and we don't want devs to fight chmod every morning.
    const info = await stat(this.path);
    const mode = info.mode & 0o777;
    if ((mode & 0o077) !== 0) {
      if (process.env.NODE_ENV === 'production') {
        throw new Error(
          `KeyProvider(${this.source}): key file mode ${mode.toString(8)} is too permissive; expected 0600 or stricter`,
        );
      }
      getLogger().warn(
        { source: this.source, mode: mode.toString(8) },
        'KEK file is group/world readable — tighten with chmod 600 before production',
      );
    }

    const contents = await readFile(this.path, 'utf-8');
    this.cached = decodeKeyMaterial(contents, this.source);
    return this.cached;
  }
}
