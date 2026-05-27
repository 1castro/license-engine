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
- `Customer`-Create ist NICHT idempotent über `(externalRef, externalSource)` — gibt bei Duplikat 409. Briefing forderte Idempotenz nur explizit für `License`. Falls das Sync-Modul später auch für Customer Idempotenz braucht, ist es 1:1 wie bei License umstellbar.
- Multi-Stage-Dockerfile-`runtime`-Target nach wie vor nicht End-to-End-gebaut.

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

**Status:** geplant

Voraussichtlicher Scope:
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

**Status:** geplant

Voraussichtlicher Scope:
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

**Status:** geplant

Voraussichtlicher Scope:
- Audit-Logging an allen sicherheitsrelevanten Stellen (IP-Hash, kein Klartext)
- Audit-Log-Viewer im Admin-UI mit Filtern
- Rate-Limiting verfeinert (Login, Activate, Recheck)
- Backup-Konzept (DB-Dumps, Key-Material separat)
- Health-Checks für Monitoring
- Optional: Brute-Force-Protection mit progressivem Backoff

---

## Phase 6 — Self-Service-Portal

**Status:** geplant — spätere Iteration, kein Sprintziel der Erst-Implementierung

Voraussichtlicher Scope:
- Kunden-Login (eigener Auth-Pfad, getrennt vom Admin)
- Lizenz-Übersicht pro Kunde
- Aktivierungen anzeigen, Geräte-Wechsel (Aktivierung freigeben)
- Rechnungs-/Subscription-Daten (falls relevant)
