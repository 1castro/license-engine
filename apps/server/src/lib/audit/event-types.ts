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
  /** A binding/activation attempt was refused (limit, missing required binding,
   *  foreign domain, unknown/inactive/expired license, invalid key). Surfaced to
   *  the admin (per-license + dashboard) and, as a plain count, to the customer. */
  ActivationRejected: 'activation.rejected',

  // API-Key lifecycle
  ApiKeyCreated: 'apikey.created',
  ApiKeyRevoked: 'apikey.revoked',

  // Signing keys & tokens
  SigningKeyCreated: 'signing_key.created',
  SigningKeyRotated: 'signing_key.rotated',
  TokenVerifyFailed: 'token.verify_failed',

  // Customer portal (self-service)
  PortalLoginSuccess: 'portal.login.success',
  PortalLoginFailure: 'portal.login.failure',
  PortalPasswordSet: 'portal.password_set',
  PortalPasswordReset: 'portal.password_reset',
  PortalSetupMailResent: 'portal.setup_mail_resent',
} as const;

export type AuditEventType = (typeof AuditEventType)[keyof typeof AuditEventType];
