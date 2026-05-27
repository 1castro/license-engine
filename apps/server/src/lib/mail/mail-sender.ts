import { getLogger } from '../logger';

/**
 * MailSender abstraction.
 *
 * Tag-2 implementation: ConsoleMailSender, logs the rendered mail to stdout
 * via pino at INFO level. Production: SMTP-backed sender via nodemailer
 * against the tropicsoft mailcow server (separate follow-up step, see
 * Phase-6 LOGBUCH entry).
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
export function getMailSender(): MailSender {
  if (!cached) cached = new ConsoleMailSender();
  return cached;
}

/** Reset cache (test hook). */
export function __resetMailSenderForTests(sender?: MailSender): void {
  cached = sender;
}
