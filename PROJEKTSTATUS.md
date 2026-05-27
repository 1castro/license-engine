# PROJEKTSTATUS — License Engine

**Aktueller Stand:** Phase 5 (Audit + Härtung) done. Wartet auf Go für Phase 6.

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
- Vitest mit **98 Tests grün** insgesamt (85 Server + 13 SDK).
- **Audit + Härtung** (Phase 5): Audit-Log-Viewer im Admin-UI mit Filter + Pagination, Brute-Force-Backoff zusätzlich zum Token-Bucket, Key-Rotation-UI für Produkte, Health-Check mit 4 parallelen Checks (DB / KEK / SigningKey-Coverage / Audit-Recency). Backup-Konzept und Pre-Deploy-Audit-Workflow als Doku.
- **SDK** (Phase 4): `@tropicsoft/license-sdk-js` mit drei Entry-Points (Core, `/node`, `/browser`). Auto-Binding (Installation-ID / Domain), drei Storage-Adapter (Memory/FS/IDB+localStorage-Fallback), Public-Keys-Discovery mit Cache + Grace-Fallback, Token-Verify mit Algorithm-Pinning, typed Errors mit `withinGracePeriod`-Info. Demo-CLI in `packages/sdk-js/demo/cli.ts` durchgespielt.
- **Token-Engine** (Phase 3): Ed25519 SigningKeys werden bei Product-Create automatisch erzeugt, Private-Keys via AES-256-GCM (envelope.ts) mit KEK verschlüsselt. JWT-Signing mit `jose` (Algorithmus EdDSA, Header mit `kid`, Claims `iss/aud/sub/iat/nbf/exp/jti` + Custom `licenseKey/features/bindings`). Token-Verification pinnt Algorithmus, verhindert `alg:none` und HS256-Confusion-Attacks.
- **Public-API** unter `/api/v1/*`: `POST /activate` (License-Key + Bindings → JWT), `POST /recheck` (JWT → erneuertes JWT oder Revocation-Signal), `POST /deactivate` (Activation freigeben, idempotent), `GET /.well-known/public-keys` (SPKI-PEM für alle Produkte, incl. rotierter Keys für Grace-Window). Rate-Limiting per IP-Hash: activate 10/min, recheck 60/min.
- **BindingPolicy**: `{required?:[…], maxPerType?:{…}}`. `applyBindings` enforced required types und per-type-Quota, resurrected released Activations bei Wiedersehen.

## Was hängt
- Multi-Stage-Dockerfile-`runtime`-Target: noch nicht End-to-End-gebaut/getestet.

## Nächste Schritte
1. Auf explizites „Go für Phase 6" warten.
2. Phase 6 starten: Self-Service-Portal für Endkunden. Eigener Login-Pfad (getrennt vom Admin), Kunden sehen ihre eigenen Lizenzen, können Aktivierungen einsehen und Geräte freigeben. Optional: React-Bindings für das SDK (`@tropicsoft/license-sdk-js/react`).

---

## Phasen-Übersicht
1. **Foundation** — Monorepo, Next.js, Prisma, PostgreSQL, Docker, Admin-Auth, leeres Admin-UI-Grundgerüst
2. **Core-Datenmodell + Admin-CRUD** — Produkte, Kunden, Lizenzen anlegen und verwalten
3. **Token-Engine** — Ed25519-Key-Management, JWT-Signing, Activate/Recheck/Revoke-Endpoints
4. **SDK JS/TS** — Paket, Aktivierung, Cache, Re-Check, Offline-Validierung, Binding-Erfassung, Demo-Integration
5. **Audit + Härtung** — Audit-Logging, Rate-Limiting, Backup-Integration, Health-Checks
6. **Self-Service-Portal** — Kunden-Login, Lizenz-Selbstverwaltung (spätere Iteration, kein Sprintziel der Erst-Implementierung)

Detaillierte Task-Listen siehe `PHASEN.md`.
