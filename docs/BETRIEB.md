# BETRIEB — License Engine

Betriebs-Referenz: **Backup & Restore, Mail-Versand, Pre-Deploy-Audit-Workflow, Cron-Jobs.**
Projekt-Überblick: [PROJEKT.md](./PROJEKT.md). Briefing: [../CLAUDE.md](../CLAUDE.md).

---

## 1. Cron-Jobs

Zwei wiederkehrende Wartungs-Skripte laufen als Host-Cron (führen `docker compose run`
im Stack-Verzeichnis aus). Ohne Cron passiert nichts automatisch.

| Skript | Zweck | Empfehlung |
|---|---|---|
| `pnpm licenses:expire` | Abgelaufene Lizenzen auf `expired` flippen (+ Audit) | täglich |
| `pnpm audit:prune` | Audit-Log nach Retention-Fristen aufräumen | täglich |

**Eingerichtet (Produktion, 2026-05-29):** Host-Cron auf `188.245.95.60` ruft täglich
03:30 UTC `/opt/stacks/license-engine/cron-maintenance.sh` auf. Das Skript führt beide
Jobs über den `license-engine-migrate`-Service aus (`docker compose run --rm … pnpm …`,
builder-Image — das schlanke runtime-Image hat kein pnpm/tsx/scripts) und loggt nach
`/var/log/license-engine-maintenance.log`. Crontab-Zeile:
`30 3 * * * /opt/stacks/license-engine/cron-maintenance.sh`.

Retention-Fristen (ENV, in `.env`): `AUDIT_RETENTION_ROUTINE_DAYS` (Default 90),
`AUDIT_RETENTION_CRITICAL_DAYS` (Default 365). Sicherheits-/Forensik-Events (Logins,
abgewiesene Aktivierungen, Token-Fehler, Widerruf/Ablauf, Key-/Passwort-Lifecycle)
werden lange gehalten, Routine kürzer. Harte Invariante: `CRITICAL >= ROUTINE` (sonst
verweigert der Start). Events, die in keiner Klasse stehen, werden nie gelöscht (fail-safe).

---

## 2. Backup & Restore

### Was gesichert werden muss

1. **PostgreSQL-Datenbank** — Produkte, Kunden, Lizenzen, Aktivierungen, Audit-Log,
   Admin-User, **verschlüsselte** Signing-Private-Keys.
2. **KEK** (`ENCRYPTION_KEY` / `ENCRYPTION_KEY_FILE`) — Master-Encryption-Key.
   **Getrennt von der DB** aufbewahren (sonst hebt die Backup-Verschlüsselung sich auf).
   Empfohlen: Bitwarden/vaultwarden. Ein DB-Backup ohne KEK kann keine neuen Tokens signieren.
3. **NextAuth-Secret** (`NEXTAUTH_SECRET`) — HMAC-Salt für die Audit-IP-Hashes. Anderer
   Wert nach Restore → alte IP-Hashes korrelieren nicht mehr (Audit-Lücke, kein Datenverlust).

**Nicht** zu sichern: `node_modules`/`.next`/Build-Output (reproduzierbar), Source (in git),
pino-Log-Files (operativ; das Audit-Log lebt in der DB).

### Tägliches DB-Backup (Beispiel)

```bash
#!/usr/bin/env bash
# /opt/license-engine/scripts/backup.sh — als cron alle 24h
set -euo pipefail
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
DEST=/var/backups/license-engine
mkdir -p "$DEST"
docker exec license-engine-db pg_dump \
  --format=custom --no-owner --no-privileges \
  -U license_engine -d license_engine \
  | gzip > "$DEST/db-${STAMP}.dump.gz"
find "$DEST" -name 'db-*.dump.gz' -mtime +30 -delete
# Optional: Off-Site-Replikation (rsync/restic/B2) — mit dem Deploy-Setup entscheiden.
```

```
# Cron:
0 3 * * *  /opt/license-engine/scripts/backup.sh >> /var/log/license-engine-backup.log 2>&1
```

### Restore-Test (Pflicht alle 90 Tage)

Frischen Postgres in separatem Volume starten, Dump per `pg_restore` einspielen, dann
Server gegen die restorete DB starten und ein `POST /api/v1/recheck` mit einem alten Token
feuern (mit dem KEK aus dem Backup-Zeitpunkt, nicht dem aktuellen). Geht das durch → Restore OK.
Jeder Restore-Test wird im LOGBUCH protokolliert (Datum, Dump-Stand, Ergebnis).

### KEK-Rotation (irregulär, bei Verdacht auf Kompromittierung)

1. Neuen KEK: `openssl rand -base64 32`. 2. Server read-only. 3. Re-Wrap-Skript: alle
`SigningKey.privateKeyEncrypted` mit altem KEK ent-, mit neuem ver-schlüsseln (atomar).
4. `ENCRYPTION_KEY` umstellen, Neustart. 5. Read-only aufheben. 6. Alte Backups als
kompromittiert markieren (nicht löschen — Audit-Pflicht). *(Re-Wrap-Skript: Backlog.)*

---

## 3. Mail-Versand

Zwei Mail-Typen aus dem Portal: **Setup-Mail** (bei Customer-Anlage, Auto-Hook) und
**Reset-Mail** (über `/portal/forgot`).

`getMailSender()` (`apps/server/src/lib/mail/mail-sender.ts`) wählt beim ersten Aufruf:

| Transport | Wann | Verhalten |
|---|---|---|
| `SmtpMailSender` | alle `SMTP_*` gesetzt **oder** `MAIL_TRANSPORT=smtp` | echter Versand via nodemailer (Pool, TLS, verify-on-first-send) |
| `ConsoleMailSender` | SMTP fehlt **oder** `MAIL_TRANSPORT=console` | Mail-Inhalt im pino-Log (Links lokal kopierbar) |

### SMTP-Konfiguration (`.env`, alle fünf zusammen)

```
SMTP_HOST=mail.example.com
SMTP_PORT=465                              # 465 = implicit TLS, 587 = STARTTLS
SMTP_USER=licensing@example.com
SMTP_PASSWORD=<app-passwort>
SMTP_FROM=tropicsoft Lizenz-Portal <licensing@example.com>
```

### mailcow-Pfad

Account anlegen (`licensing@tropicsoft.de`, kleine Quota), **App-Passwort** für SMTP
erzeugen (nicht das Account-Passwort teilen) → in `SMTP_PASSWORD`. DKIM + SPF in der
DNS-Zone von `tropicsoft.de` müssen `mail.ts-mailserver.de` als autorisierten Sender
listen (Cross-Server-Versand). Health-Check zeigt `mail.transport` (`smtp:host:port`
aktiv; `console` darf in Produktion nie erscheinen).

**Nicht im System:** IMAP-Empfang (Kundenantworten liest du im Mail-Client), HTML-Templates
(Plaintext reicht), per-Customer-Locale (alles deutsch).

---

## 4. Pre-Deploy-Audit-Workflow

**Grundregel (aus CLAUDE.md):** Kein Deploy ohne dass alle drei Audits dokumentiert grün
sind — auch bei kleinen Änderungen. Drei separate Sub-Agenten, je eine Rolle, keine Vermischung.

1. **Code-Audit** — Bugs/Edge-Cases, Type-Sicherheit, dead Code, Test-Abdeckung der
   sicherheitskritischen Pfade, fehlende Negativtests.
2. **Workflow-/Logik-Audit** — Aktivierungs-/Re-Check-/Admin-Flows, Edge-Cases (Grace,
   Token-Ablauf, Binding-Mismatch, Key-Rotation), Konsistenz Datenmodell ↔ API ↔ SDK.
3. **Security-Audit** — Crypto/Key-Handling, JWT-Pinning + Claim-Validierung, Auth
   (Session/TOTP-Replay/Brute-Force), Input-Validierung, Secret-Management, Rate-Limiting,
   Injection/XSS/CSRF, Audit-Log-Integrität (IPs gehasht).

**Severity:** `blocker` / `major` / `minor` / `nit`. Blocker + Major müssen vor Deploy gefixt sein.

**Durchführung:** git-Hash festhalten → drei Agenten parallel (in der Praxis als
`pre-deploy-audit`-Workflow mit adversarialer Verifikation jedes Findings) → Findings ins
LOGBUCH unter Datum + Hash → Blocker/Major fixen → Re-Check → bei „alle grün" + Jans
Freigabe darf deployt werden.

**LOGBUCH-Eintrag pro Lauf:** Datum + git-Hash, je Audit Scope + Findings (Anzahl je
Severity) + Status (`grün` / `Findings offen`), Deploy-Freigabe (Datum, durch wen, Target).

**Nach kritischem Finding post-Deploy:** Rollback-Bewertung (rollback vs. hotfix),
Hotfix-Planung + Lessons-Learned im LOGBUCH, erneuter Audit vor dem Hotfix-Deploy.
