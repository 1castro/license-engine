import { getLogger } from '../logger';
import { getEnv } from '../env';
import { SmtpMailSender } from './smtp-mail-sender';

/**
 * MailSender abstraction.
 *
 * Resolves at first call:
 *   - if MAIL_TRANSPORT=console  → always ConsoleMailSender
 *   - if MAIL_TRANSPORT=smtp     → require complete SMTP_* env, else throw
 *   - otherwise                  → SmtpMailSender if SMTP_* complete, else Console fallback
 */
export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface MailSender {
  send(message: MailMessage): Promise<void>;
  readonly transport: string;
}

class ConsoleMailSender implements MailSender {
  readonly transport = 'console';

  async send(message: MailMessage): Promise<void> {
    const log = getLogger();
    log.info(
      {
        event: 'mail.sent.console',
        to: message.to,
        subject: message.subject,
        // The full text body is printed at INFO so the dev/operator can copy
        // the magic link or setup token directly from the server log.
        body: message.text,
      },
      `[MAIL] -> ${message.to} | ${message.subject}`,
    );
  }
}

let cached: MailSender | undefined;

function buildSender(): MailSender {
  const env = getEnv();
  const smtpComplete =
    !!env.SMTP_HOST && !!env.SMTP_PORT && !!env.SMTP_USER && !!env.SMTP_PASSWORD && !!env.SMTP_FROM;

  if (env.MAIL_TRANSPORT === 'console') return new ConsoleMailSender();
  if (env.MAIL_TRANSPORT === 'smtp') {
    if (!smtpComplete) {
      throw new Error('MAIL_TRANSPORT=smtp but SMTP_* env vars are incomplete');
    }
    return new SmtpMailSender({
      host: env.SMTP_HOST!,
      port: env.SMTP_PORT!,
      user: env.SMTP_USER!,
      password: env.SMTP_PASSWORD!,
      from: env.SMTP_FROM!,
    });
  }
  // Auto: SMTP if complete, console fallback otherwise.
  if (smtpComplete) {
    return new SmtpMailSender({
      host: env.SMTP_HOST!,
      port: env.SMTP_PORT!,
      user: env.SMTP_USER!,
      password: env.SMTP_PASSWORD!,
      from: env.SMTP_FROM!,
    });
  }
  return new ConsoleMailSender();
}

export function getMailSender(): MailSender {
  if (!cached) cached = buildSender();
  return cached;
}

/** Reset cache (test hook). */
export function __resetMailSenderForTests(sender?: MailSender): void {
  cached = sender;
}
