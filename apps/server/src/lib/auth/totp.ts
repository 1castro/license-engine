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
  /**
   * Unix-time / step at which the accepted code was logically consumed.
   * For window-accepted codes (drift), this is the actual step the code came
   * from, NOT the current wall-clock step — that's what the replay-store
   * needs to compare with `> lastUsedStep`.
   */
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
 * <= S may be accepted again for this user. The caller persists `usedStep`
 * to `AdminUser.totpLastUsedStep` via an ATOMIC compare-and-set
 * (`updateMany WHERE totpLastUsedStep < usedStep`) — single-row update
 * after this function would still race between parallel requests.
 *
 * We derive `usedStep` from `authenticator.checkDelta` (returns -1/0/+1
 * for window-accepted codes), so a code from `nowStep-1` reports usedStep
 * = nowStep-1 — not nowStep. That way replay-store comparison is precise
 * and a stale code from a previous step can't be hidden by bumping the
 * counter to nowStep.
 */
export function verifyTotp(params: {
  token: string;
  secret: string;
  lastUsedStep: bigint;
}): TotpVerifyResult {
  if (!/^\d{6}$/.test(params.token)) {
    return { valid: false };
  }

  const delta = authenticator.checkDelta(params.token, params.secret);
  if (delta === null) {
    return { valid: false };
  }

  const nowStep = BigInt(Math.floor(Date.now() / 1000 / TOTP_STEP_SECONDS));
  const usedStep = nowStep + BigInt(delta);

  if (usedStep <= params.lastUsedStep) {
    return { valid: false };
  }

  return { valid: true, usedStep };
}
