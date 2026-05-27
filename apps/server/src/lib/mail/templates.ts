import { getEnv } from '../env';
import type { MailMessage } from './mail-sender';

/**
 * Mail templates for the self-service portal.
 *
 * Tag-2: plaintext only, German. Per-customer locale comes when the first
 * customer needs it.
 */

interface SetupMailInput {
  to: string;
  customerName: string;
  setupUrl: string;
  expiresAt: Date;
}

export function buildSetupPasswordMail(input: SetupMailInput): MailMessage {
  const env = getEnv();
  const expires = input.expiresAt.toLocaleString('de-DE', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  const text = `Hallo ${input.customerName},

dein Zugang zum Lizenz-Portal von ${env.JWT_ISSUER} ist eingerichtet.

Setze jetzt dein Passwort über folgenden Link:
${input.setupUrl}

Der Link ist bis ${expires} gültig.

Wenn du das Portal nicht angefordert hast, kannst du diese Mail ignorieren.

Viele Grüße
${env.JWT_ISSUER}`;

  return {
    to: input.to,
    subject: `Lizenz-Portal — Passwort festlegen`,
    text,
  };
}

interface ResetMailInput {
  to: string;
  customerName: string;
  resetUrl: string;
  expiresAt: Date;
}

export function buildResetPasswordMail(input: ResetMailInput): MailMessage {
  const env = getEnv();
  const expires = input.expiresAt.toLocaleString('de-DE', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  const text = `Hallo ${input.customerName},

du hast ein neues Passwort für dein Lizenz-Portal angefordert.

Setze es jetzt zurück über folgenden Link:
${input.resetUrl}

Der Link ist bis ${expires} gültig.

Wenn du das nicht warst, ignoriere diese Mail — dein bestehendes Passwort bleibt aktiv.

Viele Grüße
${env.JWT_ISSUER}`;

  return {
    to: input.to,
    subject: `Lizenz-Portal — Passwort zurücksetzen`,
    text,
  };
}
