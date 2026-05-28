/**
 * Public error classes from the License Engine SDK.
 *
 * Callers should pattern-match on `instanceof` to distinguish the cases
 * — each error class has its own remediation:
 *   - LicenseInvalidKeyError: user typed the key wrong
 *   - LicenseRevokedError: contact support / re-buy
 *   - LicenseExpiredError: renew subscription
 *   - BindingMismatchError: app is bound to a different domain/device
 *   - ServerUnreachableError: network — try again later, grace period
 *   - LicenseTokenInvalidError: token tampered or wrong key (shouldn't happen
 *     under normal use; treat as a hard failure)
 */
export class LicenseSdkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class LicenseInvalidKeyError extends LicenseSdkError {
  constructor(public readonly reason: string) {
    super(`Invalid license key: ${reason}`);
  }
}

export class LicenseNotActiveError extends LicenseSdkError {
  constructor(message = 'License is not active') {
    super(message);
  }
}

/**
 * Every binding on the cached token has been released server-side (e.g. the
 * seat was freed centrally in the portal). The LICENSE itself is fine — the
 * client must call `activate()` again to obtain a fresh seat/token. The SDK
 * clears its cached state before throwing this.
 */
export class BindingsReleasedError extends LicenseSdkError {
  constructor(message = 'All bindings for this token were released — re-activation required') {
    super(message);
  }
}

export class LicenseRevokedError extends LicenseSdkError {
  constructor(public readonly revokedAt?: Date | null) {
    super(
      revokedAt ? `License was revoked at ${revokedAt.toISOString()}` : 'License has been revoked',
    );
  }
}

export class LicenseExpiredError extends LicenseSdkError {
  constructor(public readonly expiredAt?: Date) {
    super(expiredAt ? `License expired at ${expiredAt.toISOString()}` : 'License has expired');
  }
}

export class BindingMismatchError extends LicenseSdkError {
  constructor(public readonly detail: string) {
    super(`License binding mismatch: ${detail}`);
  }
}

export class LicenseTokenInvalidError extends LicenseSdkError {
  constructor(public readonly code: string, message: string) {
    super(`Token invalid (${code}): ${message}`);
  }
}

export class ServerUnreachableError extends LicenseSdkError {
  constructor(
    public readonly reason: string,
    /** Whether the cached token is still inside its grace window. */
    public readonly withinGracePeriod: boolean,
    /** When the cached token will hard-expire if the server stays unreachable. */
    public readonly tokenExpiresAt?: Date,
  ) {
    const graceNote = withinGracePeriod
      ? `, cached token still valid until ${tokenExpiresAt?.toISOString() ?? 'unknown'}`
      : ', cached token has expired';
    super(`License server unreachable (${reason})${graceNote}`);
  }
}
