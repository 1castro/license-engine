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

### Tägliches DB-Backup (live seit 27.10.2026, betreut vom Server-Chat docker-server-60)

Die Sicherung gehört zur zentralen Sicherung von .60. Die License Engine baut **keine eigene**,
damit nichts doppelt läuft. Plan: `docker-server-60/docs/PLAN-WARTUNG-UPDATES-BACKUP.md` §6b.

| Was | Wo / Wann |
|---|---|
| DB-Dump | `/opt/db-dumps/license_engine_<UTC-Zeit>.dump` (`pg_dump -Fc`, Rechte 600) |
| Zeitpunkt | täglich 02:20 lokal, root-Cron, Skript `/opt/stacks/sicherung/license-engine-dump.sh` |
| Vorhalt | 8 Tage; das Skript prüft jeden Dump per `pg_restore -l` (Tabellendaten > 0) |
| Log | `/opt/stacks/sicherung/license-engine-dump.log` |
| Außer Haus | Kopia sichert `/opt` täglich 03:00 verschlüsselt auf die Hetzner Storage Box. Darin sind Dumps, `/opt/stacks/license-engine/.env` (KEK!), `compose.yaml` und `cron-maintenance.sh`. |

**Offen:** Dump und `.env` (KEK) liegen heute im selben Kopia-Repo. Das widerspricht der Trennungs-Regel
oben. Jan hat das bewusst so entschieden; die Trennung kommt mit dem Backup-Projekt.
Der Wartungs-Cron 03:30 kollidiert nicht mit der Sicherung.

### Restore-Test (Pflicht alle 90 Tage)

Erprobter Ablauf (27.10.2026), komplett auf .60, ohne den Live-Stack anzufassen:
1. Wegwerf-Netz + Wegwerf-Postgres (`postgres:16-alpine`) mit Zufallspasswort starten.
2. Neuesten Dump per `docker cp` hinein, `pg_restore --no-owner --exit-on-error`.
3. Zeilenzahlen (Product, Customer, License, Activation, SigningKey, ApiKey) gegen die Live-DB vergleichen.
4. `license-engine:latest` mit `--env-file /opt/stacks/license-engine/.env` und `DATABASE_URL` auf die
   Wegwerf-DB starten und `/api/health?level=ready` mit Health-Token abfragen. `kek` und `signingKeys`
   müssen ok sein, denn das beweist, dass der KEK die gesicherten Signaturschlüssel entschlüsselt.
5. Wegwerf-Container und -Netz entfernen.

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
