# PHASEN — License Engine

Detaillierte Phasen- und Task-Planung. Tasks werden während der Umsetzung verfeinert. Status pro Phase: `geplant` / `in Arbeit` / `done`.

---

## Phase 1 — Foundation

**Status:** geplant — wartet auf „Go für Phase 1"

### Tasks
1. Monorepo-Setup mit pnpm Workspaces (`apps/server`, `packages/sdk-js`, `packages/shared-types`)
2. Next.js 14 in `apps/server` initialisieren (App Router, TypeScript strict)
3. ESLint, Prettier, EditorConfig konfigurieren
4. Prisma initialisieren, leeres `schema.prisma` mit ersten Models (`AdminUser`, `Product` mindestens)
5. `docker-compose.yml` für lokales Dev: PostgreSQL 16 + App-Container (mit Hot-Reload via Volume-Mount)
6. `.env.example` vervollständigen, `.env` lokal anlegen
7. NextAuth mit Credentials Provider einrichten
8. TOTP-Integration via `otplib`, Admin-Login-Seite
9. CLI-Skript für initiale Admin-User-Erstellung (Bootstrap, keine offene Registrierung)
10. Leeres Admin-Dashboard-Grundgerüst (geschützte Route, Layout, Navigation)
11. Multi-Stage-Dockerfile für Production-Build
12. Health-Check-Endpoint (`GET /api/health` → DB-Ping + App-Status)
13. Basis-Test-Setup mit Vitest, ein Smoke-Test pro Schicht

### Definition of Done
- `pnpm dev` startet Next.js lokal mit funktionierender DB-Anbindung
- `docker-compose up` startet App + DB sauber
- Admin kann sich mit Passwort + TOTP einloggen und sieht geschütztes Dashboard-Stub
- Health-Endpoint liefert 200 mit DB-Status
- Linter, TypeScript-Check und Tests grün
- LOGBUCH, PROJEKTSTATUS, CHANGELOG aktualisiert
- Falls in dieser Phase bereits ein Deploy (z.B. auf Staging) ansteht: Audit-Workflow durchgeführt und dokumentiert

---

## Phase 2 — Core-Datenmodell + Admin-CRUD

**Status:** geplant

Wird bei Erreichen von Phase-1-Done auf Task-Ebene heruntergebrochen. Voraussichtlicher Scope:
- Prisma-Schema komplett (`SigningKey`, `Customer`, `License`, `Activation`, `AuditLog`)
- Admin-CRUD-UIs für Produkte, Kunden, Lizenzen
- Lizenz-Status-Management (aktiv / widerrufen / abgelaufen)
- Feature-Katalog pro Produkt + Feature-Flag-Auswahl pro Lizenz
- BindingPolicy-Editor (UI für Bindungs-Konfiguration)

---

## Phase 3 — Token-Engine

**Status:** geplant

Voraussichtlicher Scope:
- Ed25519-Key-Generierung + verschlüsselte DB-Speicherung
- Key-Rotation-Workflow (alte Keys für Verifikation behalten, neue fürs Signing)
- JWT-Signing mit `jose`, Claim-Mapping (`iss`, `aud`, `sub`, `exp`, `nbf`, Custom-Claims für Bindings + Features)
- Endpoints: `POST /api/v1/activate`, `POST /api/v1/recheck`, `POST /api/v1/deactivate`
- `GET /api/v1/.well-known/public-keys` (Public Keys pro Produkt)
- Revocation-Strategien (default: Re-Check; optional: Refresh-Token)
- Rate-Limiting auf öffentlichen Endpoints
- Tests: Sign/Verify Roundtrip, Algorithmus-Pinning, Replay-Schutz, Binding-Validierung

---

## Phase 4 — SDK JS/TS

**Status:** geplant

Voraussichtlicher Scope:
- Paket `@tropicsoft/license-sdk-js` (Workspaces, eigenes `package.json`)
- Framework-agnostic Core: `activate()`, `validate()`, `recheck()`, `deactivate()`
- Storage-Adapter (Browser: IndexedDB; Node: Dateisystem; konfigurierbar)
- Offline-Validierung gegen mitgelieferte Public Keys (Algorithmus-Pinning)
- Grace-Period-Verhalten bei Server-Unerreichbarkeit
- Binding-Kontext-Erfassung (Browser → Domain; Node → Installation-ID)
- Fehler-Klassen: `LicenseExpiredError`, `LicenseRevokedError`, `BindingMismatchError`, `ServerUnreachableError`
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
