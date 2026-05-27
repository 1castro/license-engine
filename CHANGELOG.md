# Changelog

Alle nennenswerten Änderungen an diesem Projekt werden hier dokumentiert.

Format orientiert sich an [Keep a Changelog](https://keepachangelog.com/de/1.1.0/),
Versionierung nach [Semantic Versioning](https://semver.org/lang/de/).

## [Unreleased]

### Changed
- `createCustomer` ist jetzt idempotent über `(externalRef, externalSource)` — analog zur License-Erstellung. Mehrfache POSTs mit gleicher externer Referenz liefern die existierende Customer-ID mit 200 statt 409. Schließt die Phase-2-Abweichung vom Briefing.

### Added — Phase 2 Core-Datenmodell + Admin-CRUD
- Prisma-Schema erweitert um `SigningKey`, `Customer`, `License`, `Activation`, `AuditLog` mit allen Enums (`SigningAlgorithm`, `ExternalSource`, `LicenseType`, `LicenseStatus`, `BindingType`, `ActivationStatus`, `AuditActorType`). `Customer` und `License` mit `externalRef` + `externalSource` für Payment-Sync-Modul. Migration `20260527100000_phase2_full_domain_model`.
- License-Key-Generator + Validator mit Crockford-Base32-Alphabet, pro 4-Zeichen-Gruppe ein Checksum-Char unter Einbezug von Prefix und Group-Index. 21 Tests grün.
- AuditLog-Writer mit HMAC-SHA256-IP-Hash (Salt aus NEXTAUTH_SECRET, keine neue ENV), Metadata-Scrubbing für sensitive Keys, fire-and-forget DB-Writes. 10 Tests grün.
- API-Key-Layer (`lek_<32-base64url>`, SHA-256-Hash für O(1)-Lookup, Scope-System, `lastUsedAt`-Tracking). 21 Tests grün (Key + Middleware).
- Zentraler `authorizeAdminRoute`-Wrapper: Session ODER API-Key, optionale Scope-Anforderung, einheitliche 401/403-Responses.
- Service-Layer für Products/Customers/Licenses/ApiKeys mit Zod-Schemas, typed Errors (`ProductInUseError`, `CustomerHasLicensesError`, `ProductNotFoundError`, `LicenseAlreadyRevokedError`, `LicenseNotFoundError`), AuditLog-Integration in jeder mutating Operation.
- Admin-API unter `/api/admin/v1/{products,customers,licenses,api-keys}` mit CRUD-Routes, License-Create idempotent über `(externalRef, externalSource)`, License-Revoke separater POST-Endpoint.
- Admin-CRUD-UIs unter `/admin/{products,customers,licenses,api-keys}` (shadcn-Komponenten + react-hook-form + Radix-Primitives), Forms POSTen an die Admin-API-Routes, lesbare Error-Mappings für 409-Konflikte, API-Key-Plaintext-Once-Show mit Copy-Button.
- 13 shadcn/ui-Komponenten manuell aufgesetzt (CLI-Probleme mit shadcn 4.x umgangen): `button`, `input`, `label`, `textarea`, `card`, `dialog`, `select`, `checkbox`, `badge`, `alert`, `table`, `form`, `dropdown-menu`.
- i18n-Sections `products`, `customers`, `licenses`, `apiKeys`, `errors` in `messages/de.json` und `messages/en.json`.

### Verified — Phase 2 Browser- + API-End-to-End
- Komplette CRUD-Klicks durch Chrome DevTools: Produkt → Kunde → Lizenz (mit dynamischen Feature-Flags + BindingPolicy) → Revoke. Lizenz-Key `TR0P-VMY6-HKMY-BRXP-19X4` (`TROP` → `TR0P` via Crockford-Normalisierung).
- API-Key `lek_…` per UI angelegt, Plaintext einmalig sichtbar mit Copy-Button + Warnung.
- API per curl gegen den Key getestet: 401 ohne Auth, 401 bei malformed Key, 403 bei fehlendem Scope, 201 bei Customer-Create, 200 (idempotent) bei zweitem License-Create mit gleicher externalRef. `apiKey.lastUsedAt` aktualisiert.
- 7 AuditLog-Einträge sauber in Postgres, `actorType` zwischen `admin` und `api_key` korrekt unterschieden, IPs nur als Hash, idempotenter Re-Call ohne zusätzlichen Audit-Eintrag.

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
