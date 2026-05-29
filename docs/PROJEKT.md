# PROJEKT — License Engine

Zentrale Projekt-Doku: **Vision, aktueller Stand, Architektur-Überblick, Roadmap.**
Chronologie steht in [LOGBUCH.md](./LOGBUCH.md), Versionen in [../CHANGELOG.md](../CHANGELOG.md),
das verbindliche Briefing in [../CLAUDE.md](../CLAUDE.md).

---

## Vision

Zentraler, selbst gehosteter Multi-Product-Lizenz-Server. Stellt signierte Tokens
(Ed25519-JWT) aus und wird über REST-API + JS/TS-SDK in beliebige eigene Projekte
integriert. Ziel: alle Lizenzierungs-Workflows einer Solo-Developer-Produktlandschaft
an einer Stelle bündeln. Payment/Billing ist bewusst **kein** Teil (siehe CLAUDE.md).

## Aktueller Stand

**LIVE in Produktion (v1.3.0)** auf `188.245.95.60`, erreichbar unter
**https://license.tropicsoft.de**. Phasen 1–7 + Voll-Audit-Härtung + Fehlversuch-Protokoll,
Integrationstests, Audit-Log-Retention und shared-types-Zentralisierung — alles live.

**Nächster Schritt:** Erste reale App-Integration — der Fahrdienst (PHP) gegen die
Seat-API. Konzept + API-Vertrag: [INTEGRATION.md](./INTEGRATION.md) (universelles Modell,
Fahrdienst als Beispiel). App-Seite im Fahrdienst-Chat per kopierbarem Prompt,
Engine-Kontrolle hier.

---

## Deployment (Produktion)

- **URL:** https://license.tropicsoft.de (via NGX Proxy Manager → `license-engine:3000`, kein Host-Port).
- **Server:** `188.245.95.60`, Stack `/opt/stacks/license-engine/`, Code `/opt/license-engine/code/`.
- **Container:** `license-engine` (Next.js standalone) + `license-engine-db` (PostgreSQL 16, internes Netz).
- **Update-Workflow:** lokal entwickeln → committen → `deploy/deploy.sh` (rsync + Server-Build + Migrations-one-shot + recreate). Kein Image-Push.
- **Mail:** SMTP gegen mailcow (`licensing@tropicsoft.de`). Details: [BETRIEB.md](./BETRIEB.md).
- **Secrets:** `ENCRYPTION_KEY` / `NEXTAUTH_SECRET` / `POSTGRES_PASSWORD` in `/opt/stacks/license-engine/.env` (chmod 600). **ENCRYPTION_KEY im Bitwarden sichern — ohne ihn sind die Signing-Keys unwiederbringlich.**
- **Cron (einzurichten):** `pnpm licenses:expire` (Lizenz-Ablauf) + `pnpm audit:prune` (Log-Retention), je täglich. Siehe [BETRIEB.md](./BETRIEB.md).

---

## Architektur-Überblick

- **Stack:** pnpm-Monorepo (`apps/server`, `packages/sdk-js`, `packages/shared-types`),
  Next.js 14 App Router, TypeScript strict, Prisma 5 + PostgreSQL 16, next-intl (de/en), pino.
- **Datenmodell:** `AdminUser`, `ApiKey`, `Product`, `SigningKey`, `Customer`, `License`,
  `Activation`, `AuditLog`, `CustomerAuthToken`.
- **Admin-Auth:** NextAuth Credentials + TOTP (Replay-Schutz, Brute-Force-Backoff), Bootstrap-CLI.
- **Service-Auth:** API-Keys (`lek_…`, SHA-256-Hash, Scopes), optional an eine Lizenz gebunden
  (Multi-Tenant-Isolation, Scope-Whitelist für gebundene Keys).
- **Token-Engine:** Ed25519-JWT via `jose` (Algorithmus-Pinning), Private-Keys per AES-256-GCM
  mit KEK envelope-verschlüsselt, Key-Rotation mit Grace-Window.
- **Public-API** `/api/v1/*`: `activate`, `recheck`, `deactivate`, `.well-known/public-keys`
  (Rate-Limiting per IP-Hash). **BindingPolicy** `{required?, maxPerType?}`, „benannte Plätze".
- **Admin-API** `/api/admin/v1/*`: Products/Customers/Licenses/ApiKeys/Activations,
  Session ODER API-Key + Scope, License-/Customer-Create idempotent über `(externalRef, externalSource)`.
- **SDK** `@tropicsoft/license-sdk-js`: Core + `/node` + `/browser`, Offline-Validierung,
  Grace-Period, typed Errors.
- **Self-Service-Portal** `/portal/*`: Kunden-Login (eigener JWT-Cookie), Lizenz-Übersicht,
  Seat-Selbstverwaltung (Aktivierungen freigeben), Fehlversuch-Hinweis.

---

## Phasen (alle abgeschlossen)

Detail-Verifikation je Phase steht im git-Verlauf + [LOGBUCH.md](./LOGBUCH.md).

| Phase | Inhalt | Status |
|---|---|---|
| 1 | Foundation (Monorepo, Next.js, Prisma, Docker, Admin-Auth) | done |
| 2 | Core-Datenmodell + Admin-CRUD (Produkte/Kunden/Lizenzen) | done |
| 3 | Token-Engine (Ed25519, JWT, activate/recheck/deactivate) | done |
| 4 | SDK JS/TS (Cache, Re-Check, Offline-Validierung, Demo) | done |
| 5 | Audit + Härtung (Audit-Viewer, Rate-Limit, Backup, Health) | done |
| 6 | Self-Service-Portal (Kunden-Login, Seat-Selbstverwaltung) | done |
| 7 | Pre-Deploy-Härtung + Production-Deploy (v1.0) | done |
| A | Seat-Management für App-Lizenzierung | done |
| — | v1.2.0 Voll-Audit-Härtung (Multi-Tenant, Quota, Portal-Session) | done |
| — | Fehlversuch-Protokoll + Integrationstests + Log-Retention (v1.3.0) | done, live |

---

## Roadmap / Backlog (priorisiert)

1. **Erste reale Integration: Fahrdienst** — Seat-Lizenzierung der PHP-App gegen die Engine.
2. **Rate-Limiter auf Redis** — erst bei Multi-Instance-Deploy nötig (aktuell single-instance).
4. **React-Bindings fürs SDK** — wenn die erste React-App das SDK clientseitig nutzt.
5. **KEK-Rotation-Skript** — bei konkretem Anlass (siehe BETRIEB.md).
6. **GitHub Actions CI** — mit der jetzt vorhandenen Integrationstest-DB sinnvoll nachrüstbar.
7. **Settings-Seite** (Admin-Account: Passwort/TOTP, später Rollen) — aktuell Platzhalter.
8. **Pruning-Sanity-Cap / Dry-Run** — nice-to-have (durch Invariante + Allowlist entschärft).
