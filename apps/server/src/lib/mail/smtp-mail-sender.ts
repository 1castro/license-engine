import { createTransport, type Transporter } from 'nodemailer';
import { getLogger } from '../logger';
import type { MailMessage, MailSender } from './mail-sender';

export interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  from: string;
}

/**
 * Production SMTP-backed mail sender.
 *
 * - `secure=true` (implicit TLS) is enabled when port is 465. STARTTLS is
 *   negotiated automatically by nodemailer when port is 587 or 25.
 * - Connections are pooled (max 3 parallel, idle 30s) — keeps mailcow happy
 *   under burst load without long-lived idle sockets.
 * - `verify()` is run lazily on the first send to surface config errors
 *   early; the result is cached for subsequent sends.
 */
export class SmtpMailSender implements MailSender {
  readonly transport: string;
  private transporter: Transporter;
  private verified = false;
  private verifyError: string | null = null;

  constructor(private readonly cfg: SmtpConfig) {
    this.transport = `smtp:${cfg.host}:${cfg.port}`;
    this.transporter = createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.port === 465,
      auth: { user: cfg.user, pass: cfg.password },
      pool: true,
      maxConnections: 3,
      maxMessages: 100,
    });
  }

  async send(message: MailMessage): Promise<void> {
    const log = getLogger();
    if (!this.verified && !this.verifyError) {
      try {
        await this.transporter.verify();
        this.verified = true;
      } catch (err) {
        this.verifyError = err instanceof Error ? err.message : 'unknown';
        log.error({ event: 'mail.smtp.verify_failed', err: this.verifyError }, 'SMTP verify failed');
        throw new Error(`SMTP verify failed: ${this.verifyError}`);
      }
    }
    const info = await this.transporter.sendMail({
      from: this.cfg.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      ...(message.html ? { html: message.html } : {}),
    });
    log.info(
      {
        event: 'mail.sent.smtp',
        to: message.to,
        subject: message.subject,
        messageId: info.messageId,
      },
      `[MAIL] -> ${message.to} | ${message.subject}`,
    );
  }

  /** Lazy probe for health-check. Returns ok=true if SMTP handshake succeeded. */
  async healthProbe(): Promise<{ ok: boolean; error?: string }> {
    if (this.verified) return { ok: true };
    if (this.verifyError) return { ok: false, error: this.verifyError };
    try {
      await this.transporter.verify();
      this.verified = true;
      return { ok: true };
    } catch (err) {
      this.verifyError = err instanceof Error ? err.message : 'unknown';
      return { ok: false, error: this.verifyError };
    }
  }
}
