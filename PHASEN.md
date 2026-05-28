# PHASEN — License Engine

Detaillierte Phasen- und Task-Planung. Tasks werden während der Umsetzung verfeinert. Status pro Phase: `geplant` / `in Arbeit` / `done`.

---

## Phase 1 — Foundation

**Status:** done (2026-05-27).

**Verifikation:**
- `pnpm typecheck`, `pnpm lint`, `pnpm test` (16 Tests) — alle grün.
- `pnpm build` (Next.js Production Build) — alle Routes kompilieren.
- `docker compose up -d postgres` → Postgres healthy.
- `prisma migrate dev --name init` → Migration `20260527092225_init` läuft sauber.
- `pnpm admin:bootstrap` → Owner-Account erzeugt, otpauth-URL ausgegeben.
- `pnpm dev` startet, `GET /api/health` → 200 mit DB-OK, `GET /admin` (unauth) → 307 zu `/login?next=…`, `GET /login` → 200.

**Browser-End-to-End-Verifikation (Chrome DevTools):**
- `/` rendert die deutsche Landing-Page.
- Klick auf „Admin" → Redirect zu `/login?next=%2Fadmin`.
- Login mit Email + Passwort + frischem TOTP-Code → Redirect zu `/admin`, Sidebar + Begrüßung „Willkommen, jan@tropicsoft.de." sichtbar.
- Logout → zurück zu `/login`.
- Replay-Versuch mit demselben TOTP-Code → abgelehnt, uniform Error „E-Mail, Passwort oder TOTP-Code falsch."
- Erneuter Login mit frischem Code → erfolgreich.
- Server-Log-Sequenz dokumentiert: `admin.login.success` → `admin.login.bad_totp` → `admin.login.success`.
- Screenshot des Dashboards: `docs/screenshots/phase1-admin-dashboard.png`.

**Offen für Phase 2 / nachgelagert:**
- Multi-Stage-Dockerfile (Target `runtime`) ist geschrieben, aber Image-Build noch nicht End-to-End getestet.

### Tasks
1. Monorepo-Setup mit pnpm Workspaces (`apps/server`, `packages/sdk-js`, `packages/shared-types`)
2. Next.js 14 in `apps/server` initialisieren (App Router, TypeScript strict)
3. ESLint, Prettier, EditorConfig konfigurieren
4. Prisma initialisieren, `schema.prisma` mit ersten Models (`AdminUser`, `Product`, `ApiKey` — Schema reicht, kein UI)
5. `docker-compose.yml` für lokales Dev: PostgreSQL 16 + App-Container (mit Hot-Reload via Volume-Mount)
6. `.env.example` vervollständigen, `.env` lokal anlegen
7. NextAuth mit Credentials Provider einrichten
8. TOTP-Integration via `otplib`, Admin-Login-Seite
9. CLI-Skript für initiale Admin-User-Erstellung (Bootstrap, keine offene Registrierung)
10. Leeres Admin-Dashboard-Grundgerüst (geschützte Route, Layout, Navigation)
11. Multi-Stage-Dockerfile für Production-Build
12. Health-Check-Endpoint (`GET /api/health` → DB-Ping + App-Status)
13. Basis-Test-Setup mit Vitest, ein Smoke-Test pro Schicht
14. **Logging:** `pino` einrichten (JSON-Output Prod, `pino-pretty` Dev), Log-Level via `LOG_LEVEL`-Env. Zentraler Logger-Export, der überall benutzt wird statt `console.*`.
15. **i18n:** `next-intl` Setup mit Locales `de` (Default) und `en` (Fallback-Stub, leere/identische Strings). App-Router-Integration. Alle UI-Strings ab Tag 1 durch `t()`.
16. **KeyProvider-Interface:** Abstraktes Interface `KeyProvider` (Methode `getEncryptionKey(): Promise<Uint8Array>`) + zwei Implementierungen `EnvKeyProvider`, `FileKeyProvider`. Auswahl per Config (File > ENV). Noch keine KMS-Adapter-Implementierung, nur Interface-Hook für später.
17. ~~**GitHub-CI:** Wurde am 2026-05-27 nach kurzer Aktivierung wieder entfernt (User-Entscheidung). Wird ggf. in Phase 5 (Härtung) gemeinsam mit dem Deploy-Audit-Workflow neu aufgesetzt.~~

### Definition of Done
- `pnpm dev` startet Next.js lokal mit funktionierender DB-Anbindung
- `docker-compose up` startet App + DB sauber
- Admin kann sich mit Passwort + TOTP einloggen und sieht geschütztes Dashboard-Stub
- Health-Endpoint liefert 200 mit DB-Status
- Logger schreibt strukturiertes JSON (Prod) bzw. lesbares Format (Dev)
- `next-intl` ist aktiv, deutsche Strings werden korrekt aufgelöst, EN-Fallback funktioniert
- KeyProvider-Interface lädt erfolgreich den KEK aus ENV bzw. File
- Linter, TypeScript-Check und Tests grün
- LOGBUCH, PROJEKTSTATUS, CHANGELOG aktualisiert
- Falls in dieser Phase bereits ein Deploy (z.B. auf Staging) ansteht: Audit-Workflow durchgeführt und dokumentiert

---

## Phase 2 — Core-Datenmodell + Admin-CRUD

**Status:** done (2026-05-27).

**Verifikation:**
- `pnpm typecheck`, `pnpm lint` grün; `pnpm test` 68 Tests grün (License-Key 21, API-Key 14, AuditLog 10, API-Key-Middleware 7, KeyProvider 7, TOTP 4, Password 3, RateLimit 2).
- `pnpm build` grün (alle Routes inkl. neuer Admin-CRUD-Pages und Admin-API-Routen kompiliert).
- Browser-End-to-End mit Chrome DevTools durchgespielt:
  - Produkt `avatar-pro` (Prefix `TROP` → kanonisiert zu `TR0P`) angelegt, in Liste sichtbar.
  - Kunde `Maria Tester` angelegt, in Liste sichtbar.
  - Lizenz mit Generator-Output `TR0P-VMY6-HKMY-BRXP-19X4` ausgestellt, Feature-Flags `voice`+`lipsync` aus Avatar-Pro-Katalog, BindingPolicy als JSON validiert.
  - Lizenz via Revoke-Dialog mit Begründung „Phase-2-Verifikationstest" widerrufen, Status in Liste wechselt auf „Widerrufen".
  - API-Key `stripe-sync-modul (test)` mit Scopes `customers:write`, `licenses:write`, `licenses:revoke` angelegt, Plaintext `lek_…` einmalig angezeigt mit Copy-Button, danach Liste zeigt nur Hash-Metadaten.
- API-Verifikation via curl:
  - `GET /api/admin/v1/customers` ohne Auth → 401.
  - mit `lek_…` aber ohne passenden Scope → 403 mit klarer Message.
  - mit ungültigem Key-Format → 401.
  - `POST /api/admin/v1/customers` mit `lek_…` + `customers:write` → 201.
  - `POST /api/admin/v1/licenses` zweimal mit gleicher `(externalRef, externalSource)`-Kombi → erst 201 (neu erzeugt), dann 200 (idempotent: dieselbe License-ID + derselbe Key zurück).
- `apiKey.lastUsedAt` nach den curl-Calls korrekt aktualisiert.
- AuditLog enthält 7 Einträge (`product.created`, `customer.created` × 2, `license.created` × 2, `license.revoked`, `apikey.created`), `actorType` korrekt zwischen `admin` und `api_key` getrennt, IPs nur als Hash gespeichert, der idempotente zweite License-Create-Call erzeugte zu Recht keinen neuen Audit-Eintrag.

**Offen / abweichend vom Briefing:**
- Multi-Stage-Dockerfile-`runtime`-Target nach wie vor nicht End-to-End-gebaut.

**Nachgezogen:**
- `Customer`-Create ist seit dem Phase-2-Nachzug ebenfalls idempotent über `(externalRef, externalSource)` (gibt 200+existing statt 409). 1:1 dasselbe Pattern wie `createLicense`. Per curl verifiziert (201 → 200 mit identischer ID, kein Doppel-Audit).

**Voraussichtlicher Scope (war Phase-2-Plan):**
- Prisma-Schema komplett (`SigningKey`, `Customer`, `License`, `Activation`, `AuditLog`)
- `Customer` und `License` mit `externalRef` (indiziert) + `externalSource` (Payment-Anbindung vorbereiten)
- `License.licenseKey` als UNIQUE-Spalte; Generator-Modul `licenseKey.generate(prefix)` mit Checksum-Char pro Gruppe (Format `TROP-XXXX-XXXX-XXXX-XXXX`)
- Lizenz-Create-Endpoint idempotent über `(externalRef, externalSource)`-Kombination
- Admin-CRUD-UIs für Produkte, Kunden, Lizenzen
- `/api/admin/v1/*` programmatische Endpoints (Session ODER API-Key + Scope geschützt)
- Lizenz-Status-Management (aktiv / widerrufen / abgelaufen)
- Feature-Katalog pro Produkt + Feature-Flag-Auswahl pro Lizenz
- BindingPolicy-Editor (UI für Bindungs-Konfiguration)
- API-Key-Auth-Middleware vollständig (Hash-Vergleich, Scope-Check, `lastUsedAt`-Update); UI-Verwaltung kann auf später vertagt werden, wenn Sync-Modul noch nicht in Sicht

---

## Phase 3 — Token-Engine

**Status:** done (2026-05-27).

**Verifikation:**
- `pnpm typecheck`, `pnpm lint` grün, `pnpm test` 80 Tests grün (12 neu: 5 envelope, 7 token-service), `pnpm build` grün inkl. 4 neuer Public-API-Routes.
- End-to-End-curl-Flow gegen avatar-pro:
  - `POST /api/v1/activate` mit Lizenz `TR0P-Y1C7-…-CHS0` + domain-Binding → 200 mit JWT.
  - JWT-Header `{alg:EdDSA, kid:cmpnykref…, typ:JWT}`, Payload mit `iss`, `aud=avatar-pro`, `sub=<license-id>`, `iat`, `nbf`, `exp` (+7d), `jti`, `licenseKey`, `features=["voice"]`, `bindings=[{type:domain, hash:c55f8889…}]`.
  - `POST /api/v1/recheck` mit demselben Token → 200 `{status:"active", token:<new>, expiresAt:…}`.
  - `POST /api/v1/deactivate` → `{released:true}`, zweiter Aufruf → `{released:false}` (idempotent).
  - `GET /api/v1/.well-known/public-keys` → 1 Eintrag für avatar-pro (active=true).
- Negativtests:
  - Falscher productSlug → 404 `license_not_active`.
  - Malformed licenseKey (kaputte Checksum) → 400 `invalid_license_key`.
  - Token-Tampering (1 Byte in Signature geflippt) → 401 `token_invalid_signature` + Audit-Event `token.verify_failed`.
  - Revoked License → recheck antwortet `{status:"revoked", revokedAt:…}`, kein neuer Token.
- AuditLog: 4 Phase-3-Events sauber (`activation.created` × 2 (Activation-Level + License-Level), `activation.released`, `token.verify_failed`), alle IPs gehasht, `actorType=anonymous` für Public-API-Calls.
- One-Shot-Script `scripts/phase3-bootstrap.ts` backfillt SigningKey für Produkte aus Phase 2 (avatar-pro hatte vor Phase 3 noch keinen).

**Offen / abweichend:**
- Multi-Stage-Dockerfile-`runtime`-Target weiterhin nicht End-to-End-gebaut.
- Rate-Limiter ist In-Memory (`activateLimiter` 10/min, `recheckLimiter` 60/min pro IP-Hash). Bei Multi-Instance-Deploy muss das auf Redis o.ä. heben.
- BindingPolicy-Schema im Activate-Pfad ist `.strip()`-lenient (legacy `{types:[…]}` aus Phase-2-Lizenzen wird toleriert, unbekannte Keys gedroppt). Die strikte Form `{required?:[…], maxPerType?:{…}}` ist für neue Lizenzen das Zielformat.
- Key-Rotation: Funktion `rotateSigningKey(product, ctx)` ist implementiert, Admin-UI-Trigger dafür kommt mit Phase 5 (Härtung).

**Voraussichtlicher Scope (war Phase-3-Plan):**
- Ed25519-Key-Generierung über `KeyProvider`-Interface (KEK lädt verschlüsselten Private-Key)
- Key-Rotation-Workflow (alte Keys für Verifikation behalten, neue fürs Signing)
- JWT-Signing mit `jose`, Claim-Mapping (`iss`, `aud`, `sub`, `exp`, `nbf`, `kid`, Custom-Claims für Bindings + Features)
- `exp` = `Product.jwtLifetimeHours` (Default 168 = 7 Tage), Re-Check-Steuerung über `Product.recheckIntervalHours` (Default 24h)
- Endpoints: `POST /api/v1/activate`, `POST /api/v1/recheck`, `POST /api/v1/deactivate`
- `GET /api/v1/.well-known/public-keys` (Public Keys pro Produkt, mit `kid`)
- Revocation-Strategien (default: Re-Check; optional: Refresh-Token, pro Produkt schaltbar)
- Rate-Limiting auf öffentlichen Endpoints
- Tests: Sign/Verify Roundtrip, Algorithmus-Pinning (kein `alg: none`), Replay-Schutz, Binding-Validierung, Key-Rotation-Roundtrip

---

## Phase 4 — SDK JS/TS

**Status:** done (2026-05-27).

**Was steht:**
- Paket `@tropicsoft/license-sdk-js` als pnpm-Workspace-Paket mit drei Entry-Points:
  - `@tropicsoft/license-sdk-js` — framework-agnostic Core (Memory-Storage, `createLicenseClient`).
  - `@tropicsoft/license-sdk-js/node` — `createNodeLicenseClient`, Filesystem-Storage, Auto-Installation-ID-Binding.
  - `@tropicsoft/license-sdk-js/browser` — `createBrowserLicenseClient`, IndexedDB-Storage (mit localStorage-Fallback), Auto-Domain-Binding.
- Public-Keys-Discovery: SDK fetched `/api/v1/.well-known/public-keys` online und cached im Storage (24h TTL Default, fällt bei Server-Unerreichbarkeit auf gestale Keys zurück).
- Token-Verify mit `jose` + strikter Algorithmus-Pinning (kein `alg:none`, kein HS256-Confusion-Angriff), `kid`-Lookup für Rotation-Grace.
- License-Key-Validator SDK-seitig (Crockford-Base32 mit Checksum) — fängt Tippfehler vor dem Server-Roundtrip ab.
- Typed Errors: `LicenseInvalidKeyError`, `LicenseNotActiveError`, `LicenseRevokedError`, `LicenseExpiredError`, `BindingMismatchError`, `LicenseTokenInvalidError`, `ServerUnreachableError` (mit `withinGracePeriod`-Info).
- Re-Check-Logik: bei `validate()` wird opportunistisch ein Recheck ausgelöst, wenn das letzte Recheck-Intervall abgelaufen ist; bei Server-Unerreichbarkeit aber gültigem cached Token kein Fehler (Grace-Period).
- Node-Demo-CLI in `packages/sdk-js/demo/cli.ts`: `pnpm demo activate/validate/recheck/deactivate/clear`.

**Verifikation:**
- `pnpm typecheck`, `pnpm lint`, `pnpm build` grün.
- 13 SDK-Tests grün (license-key 6, verify 4, storage 3) + 80 Server-Tests = **93 Tests grün**.
- Demo-CLI gegen lokal laufenden Server gegen Lizenz `TR0P-Y1C7-…-CHS0` mit Product `avatar-pro` durchgespielt:
  1. `activate` → Token persistiert, expiresAt `iat+7d`, features `[voice]`.
  2. `validate` → Cache-Hit, kein Server-Roundtrip, `refreshedFromServer=false`.
  3. `recheck` → Server-Roundtrip, neuer Token, `refreshedFromServer=true`.
  4. Persistence in `~/.config/license-engine/avatar-pro/`: `installation-id.v1`, `license-state.v1`, `public-keys.v1`, alle mit Mode `0600`.
  5. `deactivate domain` → `released=true`.
  6. Invalid Key (Checksum-Tippfehler) → `LicenseInvalidKeyError` mit Reason — abgefangen ohne Server-Roundtrip.
  7. `clear` + `validate` → `LicenseNotActiveError`.

**Offen / abweichend:**
- React-Bindings als optionales Sub-Paket: nicht Tag 1 implementiert. Kommt mit Phase 6 (Self-Service-Portal), dort macht's konkret Sinn.
- Multi-Stage-Dockerfile-`runtime`-Target weiterhin nicht End-to-End-gebaut.
- License-Key-Validator ist im SDK und im Server-Code dupliziert. Move nach `@license-engine/shared-types` ist Kandidat für eine spätere Konsolidierung.

**Voraussichtlicher Scope (war Phase-4-Plan):**
- Paket `@tropicsoft/license-sdk-js` (Workspaces, eigenes `package.json`)
- Framework-agnostic Core: `activate()`, `validate()`, `recheck()`, `deactivate()`
- Storage-Adapter (Browser: IndexedDB; Node: Dateisystem; konfigurierbar)
- Offline-Validierung gegen mitgelieferte Public Keys (Algorithmus-Pinning, `kid`-Lookup)
- Grace-Period-Verhalten bei Server-Unerreichbarkeit (Grace = `exp` des Tokens; nach Ablauf harter Failure)
- Binding-Kontext-Erfassung (Browser → Domain; Node → Installation-ID)
- Fehler-Klassen: `LicenseExpiredError`, `LicenseRevokedError`, `BindingMismatchError`, `ServerUnreachableError` (mit Grace-Period-Info)
- License-Key-Format-Validierung im SDK (Checksum-Check vor Activate-Call → schneller User-Feedback bei Tippfehler)
- React-Bindings als optionales Sub-Paket
- Demo-Integration in einer Mini-App

---

## Phase 5 — Audit + Härtung

**Status:** done (2026-05-27).

**Was steht:**
- **Audit-Log-Viewer** im Admin-UI (`/admin/audit-log`): Service `audit-log-service.ts` mit `listAuditLogs` (Filter über eventType / actorType / actorId / targetType / targetId / from / until, Offset-Pagination), Route `/api/admin/v1/audit-logs` (scope `audit:read`), UI mit Filter-Form (Buttons in eigener Footer-Zeile rechtsbündig), Tabelle + Pagination. Sidebar-Item aktiviert.
- **Brute-Force-Protection:** Stateful progressives Backoff (`src/lib/auth/login-backoff.ts`) zusätzlich zum bestehenden Token-Bucket-Rate-Limit. Wait-Skala 0s/0s/5s/15s/45s/120s/300s (cap), Reset bei Login-Success. In `auth/config.ts` integriert für `unknown_email` / `bad_password` / `bad_totp` jeweils mit `recordFailure`, `recordSuccess` nach erfolgreichem TOTP. 5 Unit-Tests grün.
- **Key-Rotation-UI:** Button im Product-Edit + `POST /api/admin/v1/products/[id]/rotate-key`. Dialog mit Confirm + Success-State + Copy-Out des neuen `kid`. Audit-Events `signing_key.created` + `signing_key.rotated`.
- **Health-Check verfeinert:** vier Checks parallel (DB-Ping, KEK loadbar + 32 Byte, jedes Product hat einen aktiven SigningKey, neuestes AuditLog-Event mit `latestEventAgoSeconds`). 503 bei jedem fehlgeschlagenen Check.
- **`docs/BACKUP.md`:** Was zu sichern ist (DB + KEK getrennt, NextAuth-Secret), Beispiel-Skript für tägliches `pg_dump` + Cron, Restore-Test-Anleitung (Pflicht alle 90 Tage), KEK-Rotation-Skizze.
- **`docs/AUDIT_WORKFLOW.md`:** Verbindlicher Pre-Deploy-Audit-Workflow für die drei Audit-Agenten (Code / Workflow / Security), LOGBUCH-Format für Audit-Dokumentation.

**Verifikation:**
- typecheck / lint / build grün, 98 Tests grün (85 Server inkl. 5 neuer Backoff-Tests + 13 SDK).
- Browser-E2E: Audit-Log-Page zeigt 16 Einträge mit allen Phase-2/3/4-Events, Filter `eventType=license.created` reduziert korrekt auf 2 Treffer. Filter-Layout-Bug (Buttons rutschten außerhalb der Card) gefixt: jetzt Filter-Felder als 2x4-Grid, Buttons in Footer-Zeile rechtsbündig mit Border-Top. Screenshots vor/nach unter `docs/screenshots/phase5-audit-log-{before,after}-fix.png`.
- Rotate-Key-Flow: alter Key `cmpnykref…` auf `isActive=false`, neuer Key `cmpnzwpfo…` auf `isActive=true`, `Product.activeSigningKeyId` umgesetzt, Audit-Events `signing_key.created` + `signing_key.rotated` (admin) in DB sichtbar.
- Enriched Health-Endpoint: `{database:ok, kek:ok, signingKeys:{productsWithoutActiveKey:0}, auditLog:{latestEventAgoSeconds:836}}`, Status `ok`.

**Offen / bewusst nicht in Phase 5:**
- **Rate-Limiter auf Redis heben** für Multi-Instance-Deploy. Tag-1-Single-Instance reicht laut Briefing; Migration wird beim ersten Multi-Instance-Deploy (oder vorher, wenn der Lastdruck es nötig macht) gemacht.
- **KEK-Rotation-Skript** (re-wrap aller `SigningKey.privateKeyEncrypted`-Werte mit neuem KEK): erst notwendig wenn ein konkreter Anlass besteht. Konzept steht in `BACKUP.md`.
- **Multi-Stage-Dockerfile-`runtime`-Target** End-to-End-Build weiterhin offen (seit Phase 1).

**Voraussichtlicher Scope (war Phase-5-Plan):**
- Audit-Logging an allen sicherheitsrelevanten Stellen (IP-Hash, kein Klartext)
- Audit-Log-Viewer im Admin-UI mit Filtern
- Rate-Limiting verfeinert (Login, Activate, Recheck)
- Backup-Konzept (DB-Dumps, Key-Material separat)
- Health-Checks für Monitoring
- Optional: Brute-Force-Protection mit progressivem Backoff

---

## Phase 6 — Self-Service-Portal

**Status:** done (2026-05-27).

**Was steht:**
- **Datenmodell-Erweiterung:** `Customer.passwordHash` + `emailVerifiedAt` + `portalLastLoginAt`. Neue Tabelle `CustomerAuthToken` mit `purpose` enum (`set_initial_password` / `reset_password`), Hash-only Storage (SHA-256), TTL pro Purpose (72h Setup, 2h Reset), Auto-Invalidation alter Tokens beim Issue. Migration `20260527120000_phase6_portal_auth`.
- **MailSender:** Interface + `ConsoleMailSender` (logt Mail-Inhalt im pino-Log). Tag-2-Stub; SMTP-Adapter gegen tropicsoft-mailcow ist ein eigener kleiner Folgeschritt.
- **Templates:** `buildSetupPasswordMail` + `buildResetPasswordMail`, beide deutsch.
- **Portal-Auth-Service:** `sendSetupMail`, `sendResetMail` (Enumeration-Defense: Antwort immer gleich), `setInitialPassword`, `resetPassword`, `loginCustomer` (Argon2-Dummy für unbekannte Email).
- **JWT-Cookie `le_portal_session`:** HS256 mit `NEXTAUTH_SECRET`, 30d Lifetime, HttpOnly + Secure (prod) + SameSite=Lax.
- **Portal-API unter `/api/portal/v1/`:** `POST login` / `logout` / `forgot-password` (rate-limit 3/min/(email,IP)) / `setup-password` / `reset-password` / `activations/[id]/release`.
- **Portal-UI** unter `/portal/*` (getrennt vom Admin, keine `next-intl`):
  - `/portal/login`, `/portal/forgot`, `/portal/setup?token=…`, `/portal/reset?token=…`
  - `/portal` — Dashboard mit Lizenz-Liste, Status-Badges, Logout.
  - `/portal/licenses/[id]` — Detail mit Status/Typ/Expiry/Features + Aktivierungs-Liste.
- **Hook in `createCustomer`:** beim Anlegen `sendSetupMail` fire-and-forget.
- **Middleware-Fix:** `/portal/*` skippt `next-intl` komplett.
- **Inline-Modale statt native `confirm()`:** Release-Button im Portal nutzt shadcn-Dialog. Pattern als Feedback-Memory verbindlich gemacht.
- **Display-Name für Aktivierungen:** SDK setzt `metadata.displayName` automatisch (Browser: `domain`, Node: `<hostname> (PID …)`). Server-Fallback in `applyBindings` setzt für `domain` und `installation` einen Display-Namen aus dem rohen Value. Portal zeigt `Domain — Jans Laptop (Dev)` + Subtitle, Hash nur noch klein-grau.

**Verifikation:**
- typecheck / lint / build grün, **92 Tests grün** (87 Server inkl. 2 neue Phase-6-Tests = portal-session 3, auth-token 4 + 5 SDK).
- Browser-E2E:
  1. Admin legt Customer „Maria Tester Portal" an → Setup-Mail im pino-Log mit Link.
  2. `/portal/setup?token=…` → Passwort gesetzt, Token konsumiert.
  3. `/portal/login` → Cookie + Redirect ins Dashboard.
  4. Per SQL Phase-3-Lizenz auf Maria umgehängt → Lizenz erscheint im Portal.
  5. License-Detail zeigt 3 Aktivierungen.
  6. Klick „Freigeben" → Modal (kein native confirm) → Activation released, AuditLog-Event mit `actorType=system, actorId=<customerId>, metadata.releasedBy=portal`.
  7. Neue Aktivierung mit `displayName: "Jans Laptop (Dev)"` → Portal zeigt sprechenden Namen, Hash nur klein.
- DB-Check: `Customer.passwordHash` gesetzt, `emailVerifiedAt`/`portalLastLoginAt` populiert, Auth-Token mit `usedAt`.

**Offen / bewusst nicht in Phase 6:**
- SMTP-Adapter (Drop-in für `ConsoleMailSender`) — folgt mit dem konkreten mailcow-Setup.
- React-Bindings für SDK — vertagt bis erste echte React-App das SDK clientseitig nutzt.
- Backfill `displayName` für Pre-Phase-6-Aktivierungen — bei Bedarf einmaliges Skript.
- Dockerfile-`runtime`-Target weiterhin nicht End-to-End-gebaut.

**Voraussichtlicher Scope (war Phase-6-Plan):**
- Kunden-Login (eigener Auth-Pfad, getrennt vom Admin)
- Lizenz-Übersicht pro Kunde
- Aktivierungen anzeigen, Geräte-Wechsel (Aktivierung freigeben)
- Rechnungs-/Subscription-Daten (falls relevant)

---

## Phase 7 — Pre-Deploy-Härtung & Production-Deploy

**Status:** done (2026-05-28). Details siehe `LOGBUCH.md` (Audit-Runden 1–3 + Deploy).

**Härtung (drei Audit-Runden, alle Blocker/Major gefixt):**
- Damm-Checksum für License-Keys (Server + SDK), Customer.email UNIQUE + Normalisierung.
- TOTP- und Portal-Token-Einlösung atomar (compare-and-set).
- `applyBindings` in Transaktion mit `SELECT … FOR UPDATE` + Status-Re-Check innerhalb der Sperre.
- Recheck: Binding-Filter (released raus) + BindingType-Whitelist; Flow „alle Bindings released → 403".
- Token-Verify-Fehler über jose-Error-Klassen (Server + SDK), Negativ-Tests.
- License-Lazy-Expire (activate/recheck) + Cron-Skript `pnpm licenses:expire`.
- Security-Header (HSTS/CSP/X-Frame/…), `TRUST_PROXY_HEADERS`, Body-Size-Cap, `bindings.max`.
- `/api/health` extern abgeschirmt (404 bei `x-forwarded-*`), Liveness-Pfad `?level=live`.
- Portal-Cookie `SameSite=Strict`, Login loggt nur IP-Hash, pino-Redact erweitert.

**Deployment:**
- Compose-Stack auf `188.245.95.60` (`/opt/stacks/license-engine/`), Code unter `/opt/license-engine/code/`.
- Zwei Container (App + PostgreSQL 16), kein Host-Port, Zugriff via NGX Proxy Manager → `license.tropicsoft.de`.
- Multi-Stage-Build (Next.js standalone, Node 22, Alpine, openssl), Migrations als one-shot im `migrate`-Profile, `pull_policy: never` + Watchtower-Ausschluss.
- Update-Workflow: `deploy/deploy.sh` (rsync + Server-Build + Migrations + recreate).

**Verifikation:**
- 111 Server- + 18 SDK-Tests, typecheck/lint/build grün.
- Externer Smoke-Test: `/` + `/admin/login` = 200, Security-Header durch den Proxy.
- Admin-Login mit TOTP, SMTP-Verbindungstest gegen mailcow grün.

**UI-Ergänzungen:**
- Favicon (Schlüssel-Symbol, App-Router-Konvention).
- Changelog-Modal in der Seitenleiste (liest `CHANGELOG.md`, XSS-sicherer Renderer, Unit-getestet).
