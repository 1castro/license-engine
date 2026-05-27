import { authenticator } from 'otplib';
import QRCode from 'qrcode';

const TOTP_STEP_SECONDS = 30;
const TOTP_WINDOW = 1; // accept current ±1 step (≈90s tolerance for clock drift)

authenticator.options = {
  step: TOTP_STEP_SECONDS,
  window: TOTP_WINDOW,
  digits: 6,
};

export interface TotpVerifyResult {
  valid: boolean;
  /** Unix-time / step at which the accepted code was logically consumed. */
  usedStep?: bigint;
}

export function generateTotpSecret(): string {
  return authenticator.generateSecret();
}

export function buildTotpOtpauthUrl(params: {
  secret: string;
  account: string;
  issuer: string;
}): string {
  return authenticator.keyuri(params.account, params.issuer, params.secret);
}

export async function renderTotpQrCodeDataUrl(otpauthUrl: string): Promise<string> {
  return QRCode.toDataURL(otpauthUrl, { margin: 1, scale: 4 });
}

/**
 * Verifies a TOTP code with replay protection.
 *
 * Replay defense: once a code from step S is accepted, no code from a step
 * <= S may be accepted again for this user. The caller persists usedStep
 * to AdminUser.totpLastUsedStep on success.
 *
 * Step granularity is 30s, so within a window an attacker who shoulder-surfs
 * a code can re-use it once at most until the user's next successful login
 * (which bumps lastUsedStep beyond it).
 */
export function verifyTotp(params: {
  token: string;
  secret: string;
  lastUsedStep: bigint;
}): TotpVerifyResult {
  if (!/^\d{6}$/.test(params.token)) {
    return { valid: false };
  }

  const verified = authenticator.verify({ token: params.token, secret: params.secret });
  if (!verified) {
    return { valid: false };
  }

  const nowStep = BigInt(Math.floor(Date.now() / 1000 / TOTP_STEP_SECONDS));
  if (nowStep <= params.lastUsedStep) {
    return { valid: false };
  }

  return { valid: true, usedStep: nowStep };
}
