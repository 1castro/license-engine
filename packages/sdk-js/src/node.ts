/**
 * Node-specific helpers: installation-id binding, filesystem storage,
 * and a `createNodeLicenseClient` convenience that wires both together.
 */
import { randomUUID } from 'node:crypto';
import { createLicenseClient, type LicenseClient } from './client';
import { createFileSystemStorage } from './storage/filesystem';
import { createMemoryStorage } from './storage/memory';
import type { BindingInput, LicenseClientConfig, StorageAdapter } from './types';

const INSTALLATION_KEY = 'installation-id.v1';

export interface NodeClientOptions {
  serverUrl: string;
  productSlug: string;
  /** Optional override; otherwise filesystem-storage under ~/.config/license-engine/<slug>. */
  storage?: StorageAdapter;
  /** Extra bindings to send in addition to the auto-detected installation id. */
  extraBindings?: BindingInput[];
  expectedIssuer?: string;
  fetchImpl?: typeof fetch;
  publicKeysRefreshMs?: number;
  fetchTimeoutMs?: number;
}

async function getOrCreateInstallationId(storage: StorageAdapter): Promise<string> {
  const existing = await storage.get(INSTALLATION_KEY);
  if (existing) return existing;
  const fresh = randomUUID();
  await storage.set(INSTALLATION_KEY, fresh);
  return fresh;
}

export async function createNodeLicenseClient(options: NodeClientOptions): Promise<LicenseClient> {
  const storage =
    options.storage ?? createFileSystemStorage({ productSlug: options.productSlug });
  const installationId = await getOrCreateInstallationId(storage);
  const bindings: BindingInput[] = [
    { type: 'installation', value: installationId, metadata: { runtime: 'node', pid: process.pid } },
    ...(options.extraBindings ?? []),
  ];

  const config: LicenseClientConfig = {
    serverUrl: options.serverUrl,
    productSlug: options.productSlug,
    storage,
    bindingOverrides: bindings,
    ...(options.expectedIssuer ? { expectedIssuer: options.expectedIssuer } : {}),
    ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
    ...(options.publicKeysRefreshMs !== undefined
      ? { publicKeysRefreshMs: options.publicKeysRefreshMs }
      : {}),
    ...(options.fetchTimeoutMs !== undefined ? { fetchTimeoutMs: options.fetchTimeoutMs } : {}),
  };
  return createLicenseClient(config);
}

export { createFileSystemStorage } from './storage/filesystem';
export { createMemoryStorage };
export * from './types';
export * from './errors';
export { validateLicenseKey, normalizeLicenseKey } from './license-key';
