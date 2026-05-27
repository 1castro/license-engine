# Changelog

Alle nennenswerten Änderungen an diesem Projekt werden hier dokumentiert.

Format orientiert sich an [Keep a Changelog](https://keepachangelog.com/de/1.1.0/),
Versionierung nach [Semantic Versioning](https://semver.org/lang/de/).

## [Unreleased]

### Verified — Phase 1 Browser-End-to-End
- TOTP-Login-Flow (Form → Submit → Redirect zu `/admin`) per Chrome DevTools durchgespielt.
- TOTP-Replay-Schutz scharf: derselbe Code wird nach erfolgreichem Verbrauch zurückgewiesen.
- Uniform Error-Message verhindert User-Enumeration / TOTP-vs-Passwort-Leak.
- Screenshot des Admin-Dashboards unter `docs/screenshots/phase1-admin-dashboard.png`.

### Added — Phase 1 Foundation
- Monorepo-Setup mit pnpm-Workspaces (`apps/server`, `packages/sdk-js`, `packages/shared-types`).
- Next.js 14.2 (App Router) + TypeScript strict + TailwindCSS + ESLint.
- `next-intl` ab Tag 1 mit Locales `de` (Default) und `en` (Fallback-Stub).
- Strukturiertes Logging mit `pino` (Dev: pretty, Prod: JSON), Redact für sensitive Felder.
- Env-Validation mit `zod` (`getEnv()`), bricht beim Start ab wenn Werte fehlen.
- `KeyProvider`-Interface mit `EnvKeyProvider` und `FileKeyProvider` (File hat Vorrang, Permission-Check in Prod, 32-Byte-Strict).
- Prisma-Schema mit `AdminUser`, `Product`, `ApiKey`. Erste Migration `20260527092225_init`.
- NextAuth Credentials Provider mit Argon2id-Passwörtern und TOTP (otplib) inklusive Replay-Schutz über `AdminUser.totpLastUsedStep`.
- In-Memory-Token-Bucket-Rate-Limiter für Login (5/min pro Email-Identifier).
- Bootstrap-CLI `pnpm admin:bootstrap` für den initialen Owner-Account.
- Admin-Layout (`/[locale]/admin`) mit Sidebar-Navigation, geschützt durch Middleware UND Server-Session-Check.
- Login-Page (`/[locale]/login`) mit Suspense-gewrappter Client-Form (E-Mail + Passwort + 6-stelliger TOTP).
- Health-Endpoint `/api/health` mit Postgres-Ping und Latenz-Report.
- Multi-Stage-Dockerfile (Targets `base/deps/dev/builder/runtime`) und `docker-compose.yml` für lokales Dev.
- Vitest-Setup mit 16 Smoke-Tests (KeyProvider, Password, TOTP, Rate-Limit).
- GitHub Actions CI (`.github/workflows/ci.yml`): install, prisma generate, lint, typecheck, test.

### Added — Setup / Architektur
- Initiale Projekt-Doku (`CLAUDE.md`, `LOGBUCH.md`, `PROJEKTSTATUS.md`, `PHASEN.md`, `CHANGELOG.md`, `README.md`, `.gitignore`, `.env.example`).
- Architektur-Entscheidungen aus Verständnisfragen in `CLAUDE.md` festgeschrieben: License-Key-Format `TROP-XXXX-XXXX-XXXX-XXXX` mit Checksum, KEK mit `KeyProvider`-Interface (File > ENV), JWT `exp = 7d` + Grace, `pino`-Logging, `next-intl` Tag 1.
- Payment/Billing-Abgrenzung als eigener Abschnitt in `CLAUDE.md`: externe Sync-Modul-Anbindung später, License Engine bleibt Payment-frei.
- Datenmodell um `License.licenseKey` (UNIQUE), `Customer/License.externalRef` + `externalSource`, `ApiKey`-Entität (Service-zu-Service-Auth) erweitert.
- API-Oberfläche in öffentliche Client-API und Admin-API (Session ODER API-Key) getrennt; Lizenz-Create idempotent über `(externalRef, externalSource)`.
- Phasen-Plan in `PHASEN.md` um Logging-, i18n-, KeyProvider-, externalRef-, Idempotenz- und API-Key-Tasks verfeinert.
- GitHub-Remote `https://github.com/1castro/license-engine.git` angebunden; Repo-Eintrag in `infrastruktur/GITHUB.md` ergänzt.

### Changed

### Deprecated

### Removed
- `.github/workflows/ci.yml` (GitHub Actions CI). Workflow lief in jedem Push fehl und verursachte Mail-Spam. Reaktivierung später, dann remote-verifiziert.

### Fixed

### Security
