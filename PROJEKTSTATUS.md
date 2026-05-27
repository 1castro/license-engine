# PROJEKTSTATUS — License Engine

**Aktueller Stand:** Phase 2 (Datenmodell + Admin-CRUD) done. Wartet auf Go für Phase 3.

**Letztes Update:** 2026-05-27

---

## Was läuft
- Monorepo + Next.js 14.2 + TypeScript strict + Tailwind 3 + ESLint + next-intl (de/en) + pino (aus Phase 1).
- Prisma 5 + Postgres 16 mit vollständigem Schema: `AdminUser`, `ApiKey`, `Product`, `SigningKey`, `Customer`, `License`, `Activation`, `AuditLog`.
- NextAuth Credentials + TOTP mit Replay-Schutz, Bootstrap-CLI (aus Phase 1).
- Admin-API-Key-Layer (`lek_<32-base64url>`, SHA-256-Hash, Scopes, `lastUsedAt`-Tracking, Plaintext-Once-Show im Create-Dialog).
- License-Key-Generator: Crockford-Base32, 4 Gruppen × 4 Zeichen mit Checksum, transparente O/I/L/U-Normalisierung.
- AuditLog-Writer mit IP-Hash via HMAC-SHA256 (stable Pseudonymisierung), Metadata-Scrubbing, fire-and-forget bei DB-Fehlern.
- Admin-CRUD-UIs für Produkte, Kunden, Lizenzen, API-Keys (shadcn/ui + react-hook-form + Radix-Primitives). Forms POSTen an die Admin-API-Routes.
- Admin-API unter `/api/admin/v1/*`: Products/Customers/Licenses/ApiKeys, Auth via Session ODER API-Key mit Scope-Check, **License- UND Customer-Create idempotent** über `(externalRef, externalSource)`.
- Vitest mit 68 Tests grün (KeyProvider 7, Password 3, TOTP 4, Rate-Limit 2, License-Key 21, AuditLog 10, API-Key 14, API-Key-Middleware 7).

## Was hängt
- Multi-Stage-Dockerfile-`runtime`-Target: noch nicht End-to-End-gebaut/getestet.

## Nächste Schritte
1. Auf explizites „Go für Phase 3" warten.
2. Phase 3 starten: Ed25519-Key-Management (über `KeyProvider`-Interface), JWT-Signing mit `jose`, Endpoints `/api/v1/activate`, `/api/v1/recheck`, `/api/v1/deactivate`, `/api/v1/.well-known/public-keys`. Key-Rotation-Workflow. Rate-Limiting auf öffentlichen Endpoints. Tests für Sign/Verify-Roundtrip, Algorithmus-Pinning, Replay-Schutz, Binding-Validierung.

---

## Phasen-Übersicht
1. **Foundation** — Monorepo, Next.js, Prisma, PostgreSQL, Docker, Admin-Auth, leeres Admin-UI-Grundgerüst
2. **Core-Datenmodell + Admin-CRUD** — Produkte, Kunden, Lizenzen anlegen und verwalten
3. **Token-Engine** — Ed25519-Key-Management, JWT-Signing, Activate/Recheck/Revoke-Endpoints
4. **SDK JS/TS** — Paket, Aktivierung, Cache, Re-Check, Offline-Validierung, Binding-Erfassung, Demo-Integration
5. **Audit + Härtung** — Audit-Logging, Rate-Limiting, Backup-Integration, Health-Checks
6. **Self-Service-Portal** — Kunden-Login, Lizenz-Selbstverwaltung (spätere Iteration, kein Sprintziel der Erst-Implementierung)

Detaillierte Task-Listen siehe `PHASEN.md`.
