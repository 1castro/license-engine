import { decodeKeyMaterial, type KeyProvider } from './key-provider';

export class EnvKeyProvider implements KeyProvider {
  readonly source = 'env:ENCRYPTION_KEY';
  private cached: Uint8Array | undefined;

  constructor(private readonly raw: string) {}

  async getEncryptionKey(): Promise<Uint8Array> {
    if (!this.cached) {
      this.cached = decodeKeyMaterial(this.raw, this.source);
    }
    return this.cached;
  }
}
