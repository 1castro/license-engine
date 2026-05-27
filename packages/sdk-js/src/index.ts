/**
 * Framework-agnostic core of the License Engine SDK.
 *
 * For Node-specific helpers (installation-id binding, filesystem storage):
 *   import { createNodeLicenseClient, … } from '@tropicsoft/license-sdk-js/node';
 *
 * For Browser-specific helpers (domain binding, IndexedDB storage):
 *   import { createBrowserLicenseClient, … } from '@tropicsoft/license-sdk-js/browser';
 */

export * from './types';
export * from './errors';
export { createLicenseClient } from './client';
export { validateLicenseKey, normalizeLicenseKey } from './license-key';
export { verifyLicenseToken } from './verify';
export { loadPublicKeys, PublicKeysFetchError } from './discovery';
export { createMemoryStorage } from './storage/memory';

export const SDK_VERSION = '0.1.0' as const;
