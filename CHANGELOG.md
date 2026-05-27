# Changelog

Alle nennenswerten Änderungen an diesem Projekt werden hier dokumentiert.

Format orientiert sich an [Keep a Changelog](https://keepachangelog.com/de/1.1.0/),
Versionierung nach [Semantic Versioning](https://semver.org/lang/de/).

## [Unreleased]

### Added — Phase 6 Self-Service-Portal
- `Customer`-Schema erweitert um `passwordHash`, `emailVerifiedAt`, `portalLastLoginAt`. Neue Tabelle `CustomerAuthToken` (Hash-only, TTL pro Purpose, Auto-Invalidation alter Tokens). Migration `20260527120000_phase6_portal_auth`.
- `MailSender`-Abstraktion mit `ConsoleMailSender` (Mail-Inhalt im pino-Log) — SMTP-Adapter als Drop-in für später.
- Portal-Auth-Service: `sendSetupMail`, `sendResetMail` (mit Enumeration-Defense), `setInitialPassword`, `resetPassword`, `loginCustomer` (Argon2-Dummy für unbekannte Email).
- JWT-Cookie `le_portal_session` (HS256, 30d, HttpOnly+Secure+SameSite=Lax) als getrennter Auth-Pfad neben dem Admin-NextAuth-Cookie.
- Portal-API unter `/api/portal/v1/{login,logout,forgot-password,setup-password,reset-password,activations/[id]/release}`.
- Portal-UI unter `/portal/*` (eigenes Layout ohne next-intl): Login / Forgot / Setup / Reset / Dashboard (Lizenz-Liste) / License-Detail (mit Aktivierungs-Release).
- Auto-Hook in `createCustomer`: bei Anlegen wird Setup-Mail fire-and-forget versendet.
- `portalForgotLimiter` (3/min pro (email,IP-Hash)) zur Mail-Spam-Defense.
- 2 neue Unit-Tests: `portal-session.test.ts` (JWT-Roundtrip + Tampering) + `auth-token.test.ts` (Hash-Determinismus + No-Leakage).

### Fixed
- Middleware: `/portal/*` skippt next-intl, sonst 404 wegen Locale-Prefix-Mismatch.
- Release-Button im Portal nutzt jetzt Inline-Modal-Dialog statt native `window.confirm()`. Pattern projektübergreifend verbindlich gemacht (Feedback-Memory `feedback_no_native_browser_confirm.md`).

### Changed
- Portal-Aktivierungen zeigen sprechenden `displayName` aus `bindingValueMetadata` (Domain-Name / `Installation <prefix>` / Caller-Wert), Hash nur noch klein-grau als Beweis. SDK setzt `displayName` automatisch (Browser: `domain`, Node: `<hostname> (PID …)`). Server-Side Fallback in `applyBindings` füllt für `domain` + `installation`, lässt `device`/`account` dem Caller (PII-Schutz).

### Added — Phase 5 Audit + Härtung
- Audit-Log-Service (`src/lib/services/audit-log-service.ts`) + `/api/admin/v1/audit-logs` Route mit Filter (eventType, actorType, actorId, targetType, targetId, from, until) und Offset-Pagination. Scope `audit:read`.
- Admin-UI `/admin/audit-log`: RSC-Tabelle mit Zeitpunkt/Event/Actor/Target/IP-Hash/Metadata, Client-Filter-Form (2x4-Grid + Footer-Buttons), Client-Pagination. Sidebar-Item aktiviert. i18n unter `auditLog.*`.
- Brute-Force-Protection (`src/lib/auth/login-backoff.ts`): stateful progressives Backoff 0s/0s/5s/15s/45s/120s/300s (cap), in NextAuth-Authorize integriert, 5 Tests grün.
- Key-Rotation-UI: `POST /api/admin/v1/products/[id]/rotate-key` + Dialog im Product-Edit mit Confirm/Success-States. AuditLog `signing_key.created` + `signing_key.rotated`.
- Health-Check (`/api/health`) erweitert auf 4 parallele Checks: Database-Ping, KEK loadbar (32-Byte-Check), SigningKey-Coverage (kein Product ohne aktiven Key), AuditLog-Recency (`latestEventAgoSeconds`). 503 bei jedem Fehler.
- `docs/BACKUP.md`: DB + KEK getrennt sichern, Beispiel-Skript für `pg_dump`-Cron, Restore-Test-Procedure, KEK-Rotation-Skizze.
- `docs/AUDIT_WORKFLOW.md`: verbindlicher Pre-Deploy-Audit-Workflow für die drei Audit-Agenten + LOGBUCH-Format.

### Fixed
- Audit-Log-Filter: Buttons („Filter anwenden", „Zurücksetzen") rutschten in der `md:grid-cols-5`-Variante visuell aus der Card. Layout auf Filter-Felder als 2/4-Spalten-Grid + Buttons in Footer-Zeile rechtsbündig mit Border-Top umgestellt.

### Added — Phase 4 SDK JS/TS
- `@tropicsoft/license-sdk-js`-Paket mit drei Entry-Points (Core, `/node`, `/browser`).
- Storage-Adapter: `createMemoryStorage`, `createFileSystemStorage` (Mode 0600, Key-Sanitization), `createIndexedDbStorage` (mit localStorage-Fallback).
- `createLicenseClient(config)` framework-agnostic mit `activate`/`validate`/`recheck`/`deactivate`/`clear`. `validate()` führt opportunistisch `recheck()` aus, fällt bei Server-Unerreichbarkeit + gültigem Token auf Cache zurück (Grace-Period).
- `createNodeLicenseClient` / `createBrowserLicenseClient`: Convenience-Wrappers mit Auto-Bindings (UUID-Installation-ID / `location.hostname`).
- Public-Keys-Discovery: cached unter `public-keys.v1`, 24h TTL Default, Fallback auf gestale Keys bei Server-Outage.
- Token-Verify mit `jose` + striktem Algorithm-Pinning (kein `alg:none`, kein HS256-Confusion), `kid`-Lookup per Product.
- Typed Errors: `LicenseInvalidKeyError`, `LicenseNotActiveError`, `LicenseRevokedError`, `LicenseExpiredError`, `BindingMismatchError`, `LicenseTokenInvalidError`, `ServerUnreachableError` (mit `withinGracePeriod` + `tokenExpiresAt`).
- License-Key-Validator (Crockford-Base32 mit Checksum) SDK-seitig, fängt Tippfehler vor Server-Roundtrip ab.
- Demo-CLI in `packages/sdk-js/demo/cli.ts`: `pnpm demo activate/validate/recheck/deactivate/clear`.
- 13 SDK-Tests grün (license-key 6, verify 4 inkl. `alg:none`-Reject + Unknown-kid + Wrong-Audience, storage 3).

### Added — Phase 3 Token-Engine
- AES-256-GCM-Envelope-Encryption (`src/lib/crypto/envelope.ts`) für SigningKey.privateKeyEncrypted, mit KEK aus dem KeyProvider. 5 Tests grün (Roundtrip, Random-Nonce, Tampered-Tag-Reject, Tampered-Ciphertext-Reject, Too-Short-Blob).
- SigningKey-Service (`src/lib/signing/signing-key-service.ts`): Ed25519-Keypair-Generierung über `jose`, Hook in `createProduct` für automatische Erzeugung, Rotate-Funktion (alte Keys bleiben für Verifikation), `getActiveSigningKey`, `getAllPublicKeysForProduct`, `listAllPublicKeys`.
- Token-Service (`src/lib/token/token-service.ts`): `signLicenseToken` (Header `alg:EdDSA + kid`, Claims iss/aud/sub/iat/nbf/exp/jti + Custom licenseKey/features/bindings), `verifyLicenseToken` mit Algorithmus-Pinning (kein `alg:none`, kein HS256-Confusion), Multi-Key-Lookup für Rotation-Grace. 7 Tests grün.
- BindingPolicy (`src/lib/binding/binding-policy.ts`): `{required?, maxPerType?}`-Schema, lenient parsing für Forward-Compat. `BindingPolicyViolationError` mit `missing_required` / `max_exceeded`.
- Binding-Hash (`src/lib/binding/binding-hash.ts`): `hashBindingValue(type, value)` = SHA-256(`type:value`), Type im Digest verhindert Cross-Type-Match.
- Activation-Service (`src/lib/binding/activation-service.ts`): `applyBindings` (Policy-Check + Resurrect-released + Quota-Enforcement + Audit), `releaseActivation` (idempotent + Audit).
- Public-API unter `/api/v1/`:
  - `POST /activate` mit License-Key + Bindings → signed JWT, Rate-Limit 10/min/IP.
  - `POST /recheck` mit Token → erneuertes Token oder `{status:"revoked"|"expired"}`. Rate-Limit 60/min/IP.
  - `POST /deactivate` mit Token + Binding → Activation freigeben. Idempotent.
  - `GET /.well-known/public-keys` mit SPKI-PEM-Listing aller Produkte, 5min Cache-Control.
- Rate-Limiter um `activateLimiter` (10/min) und `recheckLimiter` (60/min) erweitert, beide IP-Hash-basiert.
- One-Shot-Skript `scripts/phase3-bootstrap.ts`: backfillt SigningKeys für vor Phase 3 angelegte Produkte.

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
