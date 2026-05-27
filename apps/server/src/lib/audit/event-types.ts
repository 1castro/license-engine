/**
 * Canonical audit event types.
 *
 * Keep this list curated — every event written to the AuditLog should pull
 * its `eventType` from here so we can reason about all possible events
 * statically.
 */
export const AuditEventType = {
  // Admin authentication (also written by lib/auth/config.ts via the same writer)
  AdminLoginSuccess: 'admin.login.success',
  AdminLoginFailure: 'admin.login.failure',
  AdminLoginRateLimited: 'admin.login.ratelimited',

  // Product lifecycle
  ProductCreated: 'product.created',
  ProductUpdated: 'product.updated',
  ProductDeleted: 'product.deleted',

  // Customer lifecycle
  CustomerCreated: 'customer.created',
  CustomerUpdated: 'customer.updated',
  CustomerDeleted: 'customer.deleted',

  // License lifecycle
  LicenseCreated: 'license.created',
  LicenseUpdated: 'license.updated',
  LicenseRevoked: 'license.revoked',
  LicenseExpired: 'license.expired',

  // Activation lifecycle
  ActivationCreated: 'activation.created',
  ActivationReleased: 'activation.released',

  // API-Key lifecycle
  ApiKeyCreated: 'apikey.created',
  ApiKeyRevoked: 'apikey.revoked',
  ApiKeyUsed: 'apikey.used',

  // Signing keys & tokens
  SigningKeyCreated: 'signing_key.created',
  SigningKeyRotated: 'signing_key.rotated',
  TokenVerifyFailed: 'token.verify_failed',
} as const;

export type AuditEventType = (typeof AuditEventType)[keyof typeof AuditEventType];
