# License Engine — Changelog

Alle nennenswerten Änderungen an diesem Projekt werden hier dokumentiert.

Format orientiert sich an [Keep a Changelog](https://keepachangelog.com/de/1.1.0/),
Versionierung nach [Semantic Versioning](https://semver.org/lang/de/).

---

## [1.1.0] - 2026-05-28 — Seat-Management für App-Lizenzierung

Grundlage, damit integrierte Apps ein Platz-Limit (Seats) nutzen, anzeigen und
verwalten können — erster Anwendungsfall: der Fahrdienst (Lizenz pro Mandant,
Plätze pro Fahrer-Account). Konzept: `docs/INTEGRATION.md`.

### Hinzugefügt
- **Seat-Auslastung in den API-Antworten**: `activate` und `recheck` liefern ein
  `seats`-Array (`{ type, used, max }` je Binding-Typ), damit eine App
  „37 von 100 Plätzen belegt" anzeigen kann.
- **Aktivierungs-Verwaltung im Admin-UI**: pro Lizenz unter „Aktivierungen" die
  belegten Plätze + Auslastung sehen und einzeln freigeben.
- **Service-API für Seat-Management**: `GET /api/admin/v1/licenses/{id}/activations`
  (auflisten) + `POST .../{activationId}/release` (freigeben), per API-Key mit den
  neuen Scopes `activations:read` / `activations:write`.
- **API-Key-Lizenz-Bindung**: Ein API-Key kann optional an eine einzelne Lizenz
  gebunden werden — er sieht und verwaltet dann nur deren Plätze (Mandanten-
  Isolation). Im API-Key-Dialog konfigurierbar.

### Sicherheit
- Lizenz-gebundener API-Key, der eine fremde Lizenz anfragt, erhält 404
  (Existenz wird nicht preisgegeben). Read/Write-Scopes getrennt.

---

## [1.0.0] - 2026-05-28 — Erste Production-Release (live auf license.tropicsoft.de)

Erste Live-Schaltung nach zwei Pre-Deploy-Audit-Runden (Code-, Workflow-,
Security-Audit). Deployment als eigener Docker-Stack auf dem Haupt-Server,
Zugriff ausschließlich über den NGX Proxy Manager.

### Sicherheit (Audit-Härtung)
- License-Key-Prüfsumme auf den **Damm-Algorithmus** umgestellt (Server + SDK) —
  erkennt garantiert alle Einzelzeichen-Fehler und Nachbar-Vertauschungen.
- **TOTP-Replay-Schutz** als atomares Compare-and-Set (kein Token zweimal gültig).
- **Portal-Auth-Tokens** werden atomar eingelöst (keine doppelte Verwendung).
- `Customer.email` mit UNIQUE-Constraint + Normalisierung (trim/lowercase) an
  allen Lese-/Schreibstellen.
- **Aktivierungen** laufen in einer Transaktion mit Zeilen-Sperre auf der Lizenz;
  Status wird innerhalb der Sperre erneut geprüft (kein Token für widerrufene Lizenz).
- Re-Check filtert freigegebene (released) Bindungen heraus und whitelistet den
  Bindungstyp gegen das Schema.
- **Security-Header** projektweit: HSTS, CSP, X-Frame-Options DENY,
  X-Content-Type-Options, Referrer-Policy, Permissions-Policy.
- `TRUST_PROXY_HEADERS`-Schalter (Default aus): Proxy-Header nur hinter dem
  Reverse-Proxy vertrauen → kein IP-Spoofing der Rate-Limit-/Audit-Hashes.
- **Health-Endpoint** (`/api/health`) von außen abgeschirmt — extern 404,
  intern (Docker-Healthcheck, Monitoring) weiter erreichbar.
- Portal-Session-Cookie auf `SameSite=Strict`; Portal-Login loggt nur den
  IP-Hash (DSGVO).
- pino-Redact-Liste erweitert (Passwörter, Secrets, Tokens, Private Keys).

### Hinzugefügt
- **SMTP-Mailversand** (`SmtpMailSender`, nodemailer, mailcow-tauglich) mit
  automatischem Fallback auf Console-Ausgabe, wenn nicht konfiguriert.
- **Lizenz-Ablauf**: Lazy-Expire beim Lesen (activate/recheck) + Bulk-Cron-Skript
  `pnpm licenses:expire`, jeweils mit `LicenseExpired`-Audit-Eintrag.
- Re-Check-Antwort liefert `recheckIntervalHours`; das SDK speichert den Wert.
- **Favicon** (Schlüssel-Symbol) für die Web-Oberfläche.
- **Changelog-Ansicht** in der Admin-Oberfläche (Link in der Seitenleiste,
  Modal mit diesem Dokument).

### Deployment
- Docker-Stack auf `188.245.95.60`: zwei Container (App + eigener PostgreSQL 16)
  in einem Compose-Stack, internes Netz für die DB, kein Host-Port.
- Erreichbar über NGX Proxy Manager unter `license.tropicsoft.de`.
- Multi-Stage-Build (Next.js standalone, Node 22, Alpine), Migrations als
  Einmal-Job im `migrate`-Profile, `pull_policy: never` + Watchtower-Ausschluss
  für saubere Dockge-Verwaltung.

---

## [0.6.0] - 2026-05-27 — Self-Service-Portal (Phase 6)

### Hinzugefügt
- Kunden-Portal unter `/portal/*` mit eigenem Login (getrennter JWT-Cookie
  `le_portal_session`, HttpOnly), Passwort-Setup und -Reset über Single-Use-Tokens
  (nur Hashes in der DB, TTL pro Zweck).
- Portal-Dashboard: Lizenz-Übersicht + Lizenz-Detail mit Freigabe von Aktivierungen.
- Setup-Mail wird beim Anlegen eines Kunden automatisch versendet.
- Mail-Abstraktion (`MailSender`) mit Console-Implementierung.

### Geändert
- Aktivierungen zeigen einen sprechenden Anzeigenamen (Domain / Installation),
  Hash nur noch als Beleg.
- Alle Bestätigungen als Inline-Modal statt nativer Browser-Dialoge.

---

## [0.5.0] - 2026-05-27 — Audit & Härtung (Phase 5)

### Hinzugefügt
- Audit-Log-Viewer in der Admin-UI mit Filtern und Pagination.
- Brute-Force-Schutz mit progressivem Backoff beim Admin-Login.
- Signing-Key-Rotation über die Produkt-Verwaltung.
- Health-Check mit Datenbank-, KEK-, Signing-Key- und Audit-Log-Prüfung.
- Backup- und Audit-Workflow-Dokumentation.

---

## [0.4.0] - 2026-05-27 — JS/TS-SDK (Phase 4)

### Hinzugefügt
- `@tropicsoft/license-sdk-js`: framework-agnostischer Core mit Aktivierung,
  Token-Cache, Re-Check, Offline-Verifikation gegen den Public Key.
- Storage-Adapter (Browser: IndexedDB, Node: Dateisystem, In-Memory für Tests).
- Klare Fehlerklassen (Expired / Revoked / BindingMismatch / ServerUnreachable
  mit Grace-Period-Info).

---

## [0.3.0] - 2026-05-27 — Token-Engine (Phase 3)

### Hinzugefügt
- Ed25519-JWT-Ausstellung mit Algorithmus-Pinning und Key-Rotation-Support.
- Öffentliche API: `/api/v1/activate`, `/recheck`, `/deactivate`,
  `/.well-known/public-keys`.
- KEK-Envelope-Verschlüsselung der privaten Signing-Keys (AES-256-GCM),
  KeyProvider-Abstraktion (Env/File).
- Rate-Limiting auf allen öffentlichen Endpunkten.

---

## [0.2.0] - 2026-05-27 — Datenmodell & Admin-CRUD (Phase 2)

### Hinzugefügt
- Prisma-Datenmodell: Product, SigningKey, Customer, License, Activation,
  AuditLog, AdminUser, ApiKey.
- Admin-UI für Produkte, Kunden und Lizenzen (Anlegen, Bearbeiten, Widerrufen).
- License-Key-Generierung (`TROP-XXXX-XXXX-XXXX-XXXX`), idempotente
  Lizenz-/Kunden-Erstellung über `externalRef`.
- API-Key-Authentifizierung mit Scopes für Service-zu-Service-Zugriff.

---

## [0.1.0] - 2026-05-27 — Foundation (Phase 1)

### Hinzugefügt
- Monorepo (pnpm Workspaces): `apps/server`, `packages/sdk-js`,
  `packages/shared-types`.
- Next.js 14 (App Router) + TypeScript strict, TailwindCSS + shadcn/ui.
- NextAuth Credentials-Login mit TOTP-2FA und Replay-Schutz.
- PostgreSQL + Prisma, Multi-Stage-Dockerfile, `docker-compose.yml`.
- next-intl (Deutsch/Englisch), pino-Logging, Vitest-Setup.
