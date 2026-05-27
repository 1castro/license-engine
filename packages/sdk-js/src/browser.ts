/**
 * Browser-specific helpers: domain auto-binding, IndexedDB storage,
 * and a `createBrowserLicenseClient` convenience that wires both together.
 */
import { createLicenseClient, type LicenseClient } from './client';
import { createIndexedDbStorage } from './storage/indexeddb';
import { createMemoryStorage } from './storage/memory';
import type { BindingInput, LicenseClientConfig, StorageAdapter } from './types';

export interface BrowserClientOptions {
  serverUrl: string;
  productSlug: string;
  /** Optional override; otherwise IndexedDB in "license-engine" database. */
  storage?: StorageAdapter;
  /** Override the auto-detected domain (e.g. for testing). */
  domainOverride?: string;
  /** Extra bindings to send in addition to the auto-detected domain. */
  extraBindings?: BindingInput[];
  expectedIssuer?: string;
  fetchImpl?: typeof fetch;
  publicKeysRefreshMs?: number;
  fetchTimeoutMs?: number;
}

export function createBrowserLicenseClient(options: BrowserClientOptions): LicenseClient {
  const storage = options.storage ?? createIndexedDbStorage();
  const domain =
    options.domainOverride ?? (typeof location !== 'undefined' ? location.hostname : 'unknown');
  const userAgent =
    typeof navigator !== 'undefined' && typeof navigator.userAgent === 'string'
      ? navigator.userAgent
      : 'unknown';
  const bindings: BindingInput[] = [
    {
      type: 'domain',
      value: domain,
      metadata: {
        runtime: 'browser',
        userAgent,
        // displayName is shown in the customer portal next to the activation.
        // For domain bindings the value itself is the most useful label.
        displayName: domain,
      },
    },
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

export { createIndexedDbStorage } from './storage/indexeddb';
export { createMemoryStorage };
export * from './types';
export * from './errors';
export { validateLicenseKey, normalizeLicenseKey } from './license-key';
