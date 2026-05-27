# Mail-Versand — License Engine

Stand: 2026-05-27. Phase-6-Nachzug.

Das System versendet zwei Mail-Typen aus dem Self-Service-Portal:
1. **Setup-Mail** bei Anlage eines neuen Customers (automatisch via `createCustomer`-Hook).
2. **Reset-Mail** auf Anfrage über `/portal/forgot`.

---

## Architektur

`getMailSender()` in `apps/server/src/lib/mail/mail-sender.ts` ist die einzige Entry-Point. Sie cached eine Instanz und entscheidet beim ersten Aufruf zwischen zwei Transports:

| Transport | Wann gewählt | Verhalten |
|---|---|---|
| `SmtpMailSender` | alle `SMTP_*` Env-Variablen gesetzt **oder** `MAIL_TRANSPORT=smtp` | echter Versand via nodemailer (pool, TLS, verify-on-first-send) |
| `ConsoleMailSender` | SMTP-Werte fehlen **oder** `MAIL_TRANSPORT=console` | Mail-Inhalt erscheint im pino-Log auf INFO — Setup-/Reset-Links lokal direkt kopierbar |

Override: `MAIL_TRANSPORT=console` zwingt Console-Modus auch wenn SMTP konfiguriert ist (praktisch für lokale Browser-Tests ohne echte Mails).

---

## SMTP-Konfiguration

In `.env` (lokal) oder als deployte Env-Variablen — alle fünf zusammen, sonst Fallback auf Console:

```
SMTP_HOST=mail.example.com
SMTP_PORT=465                              # 465 = implicit TLS, 587 = STARTTLS
SMTP_USER=licensing@example.com
SMTP_PASSWORD=<app-passwort>
SMTP_FROM=tropicsoft Lizenz-Portal <licensing@example.com>
```

- Port `465`: `secure=true`, implicit TLS ab erstem Byte.
- Port `587`: STARTTLS-Upgrade nach EHLO. nodemailer macht das automatisch wenn `secure=false`.
- Pool: 3 parallele Connections, max 100 Messages pro Connection.

---

## mailcow-Setup-Pfad

1. mailcow → Mail-Konten → neuen Account anlegen, z.B. `licensing@tropicsoft.de`.
2. Quota klein halten (10 MB reicht — das Postfach empfängt nur die Antworten der Kunden, die du händisch siehst; die Engine selbst empfängt nichts).
3. **App-Passwort** für SMTP erstellen statt das Account-Passwort zu teilen:
   - mailcow → Account-Settings → App-Passwörter → „License Engine SMTP" erzeugen.
   - Diesen Wert in `SMTP_PASSWORD` legen. Das normale Account-Passwort bleibt für IMAP/Webmail reserviert.
4. Im Mail-Client (für dich, nicht für die Engine) den Account einbinden, sodass du Kundenantworten siehst.

---

## Health-Check

`GET /api/health` zeigt:

```
"mail": {
  "ok": true,
  "transport": "smtp:mail.ts-mailserver.de:465"
}
```

- `transport=smtp:host:port` → SmtpMailSender ist aktiv.
- `transport=console` → Fallback, **Produktion sollte das nie anzeigen**.
- `ok=false` mit `detail` → SMTP-Verify schlug fehl, z.B. Auth-Fehler oder unerreichbarer Host. Mail-Versand würde bei jedem Aufruf neu probieren.

Der erste `mail.send()`-Aufruf macht ein `transporter.verify()` (TLS-Handshake + AUTH), cached das Ergebnis. Spätere Sends nutzen den Pool ohne Re-Verify.

---

## Was nicht im System ist

- **IMAP-Empfang**: nicht nötig. Das Postfach `licensing@…` empfängt nur Kunden-Antworten, die du in deinem Mail-Client liest. Wenn wir später Bounce-Handling automatisieren wollen (z.B. `LicenseExpiredError` bei harten Bounces), wäre IMAP+`mailparser` ein eigener Folgeschritt.
- **HTML-Templates**: Tag-2 nur Plaintext. Reicht für transactional mails und vermeidet Spam-Score-Probleme. HTML-Mails ergänzen wir wenn der erste Kunde explizit darum bittet oder wir Branding einbauen.
- **Per-Customer-Locale**: aktuell alle Mails deutsch. `Customer.locale` als Feld kommt wenn ein internationaler Kunde es braucht.

---

## Operations

- **Bounce-Mails** landen im `licensing@…` Postfach — händisch prüfen.
- **Spam-Verdacht**: SPF/DKIM für die Sender-Domain muss korrekt sein. Bei mailcow ist das Out-of-the-Box; bei Cross-Server-Setup (Engine sendet als `licensing@tropicsoft.de` über `mail.ts-mailserver.de`) sicherstellen dass DKIM + SPF in der DNS-Zone von `tropicsoft.de` den `mail.ts-mailserver.de` als autorisierten Sender listen.
- **Password-Rotation**: App-Passwort tauschen → `SMTP_PASSWORD` in `.env` bzw. Deploy-Secret updaten → Server neu starten. Cache wird beim Boot neu aufgebaut.
