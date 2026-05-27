# PROJEKTSTATUS — License Engine

**Aktueller Stand:** Phase 1 (Foundation) done. Wartet auf Go für Phase 2.

**Letztes Update:** 2026-05-27

---

## Was läuft
- Monorepo (pnpm-Workspaces) mit `apps/server`, `packages/sdk-js`, `packages/shared-types`.
- Next.js 14.2 + TypeScript strict + Tailwind 3 + ESLint + next-intl (de/en) + pino.
- Prisma 5 + Postgres 16 (Schema: AdminUser/Product/ApiKey), Initial-Migration läuft.
- NextAuth-Credentials + TOTP (argon2id + otplib, Replay-Schutz + In-Memory-Rate-Limit), geschützte `/admin`-Routes (Middleware + Server-Session als Defense-in-Depth).
- Bootstrap-CLI (`pnpm admin:bootstrap`) für den initialen Owner-Account.
- Health-Endpoint mit DB-Ping, KeyProvider (File > ENV) mit 32-Byte-Validation und Permission-Check.
- Docker-Compose (Postgres + App-Container mit Hot-Reload), Multi-Stage-Dockerfile mit `runtime`-Target.
- Vitest mit 16 Tests grün (KeyProvider, Password, TOTP, Rate-Limit).
- GitHub Actions CI (`.github/workflows/ci.yml`): install + prisma generate + lint + typecheck + test.

## Was hängt
- Multi-Stage-Dockerfile-`runtime`-Target: noch nicht End-to-End-gebaut/getestet.

## Nächste Schritte
1. Commit + Push der Phase-1-Foundation.
2. Auf explizites „Go für Phase 2" warten.
3. Phase 2 starten: Datenmodell komplett (SigningKey, Customer, License, Activation, AuditLog), Admin-CRUD-UIs, programmatische Admin-API, License-Key-Generator mit Checksum, ApiKey-Auth-Middleware.

---

## Phasen-Übersicht
1. **Foundation** — Monorepo, Next.js, Prisma, PostgreSQL, Docker, Admin-Auth, leeres Admin-UI-Grundgerüst
2. **Core-Datenmodell + Admin-CRUD** — Produkte, Kunden, Lizenzen anlegen und verwalten
3. **Token-Engine** — Ed25519-Key-Management, JWT-Signing, Activate/Recheck/Revoke-Endpoints
4. **SDK JS/TS** — Paket, Aktivierung, Cache, Re-Check, Offline-Validierung, Binding-Erfassung, Demo-Integration
5. **Audit + Härtung** — Audit-Logging, Rate-Limiting, Backup-Integration, Health-Checks
6. **Self-Service-Portal** — Kunden-Login, Lizenz-Selbstverwaltung (spätere Iteration, kein Sprintziel der Erst-Implementierung)

Detaillierte Task-Listen siehe `PHASEN.md`.
