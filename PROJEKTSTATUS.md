# PROJEKTSTATUS — License Engine

**Aktueller Stand:** **Phase 6 (Self-Service-Portal) done.** License Engine fundamental feature-complete. Roadmap-Backlog für spätere Iterationen siehe unten.

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
- Vitest mit **92 Tests grün** insgesamt (87 Server + 5 SDK).
- **Self-Service-Portal** (Phase 6): eigener Customer-Auth-Pfad (Email + Argon2-Passwort), separater JWT-Cookie `le_portal_session`, Setup-Mail beim Customer-Create (Auto-Hook), Forgot-/Reset-Flow mit single-use Tokens (Hash-only-Storage), Portal-UI unter `/portal/*` mit Lizenz-Übersicht + License-Detail + Activation-Release per Inline-Modal. Aktivierungen zeigen sprechenden Display-Namen (`Domain — Jans Laptop (Dev)`) statt nur Hash.
- **Mail-Versand**: `ConsoleMailSender`-Stub Tag-2 (Inhalt im pino-Log); SMTP-Adapter folgt mit mailcow-Setup.
- **Audit + Härtung** (Phase 5): Audit-Log-Viewer im Admin-UI mit Filter + Pagination, Brute-Force-Backoff zusätzlich zum Token-Bucket, Key-Rotation-UI für Produkte, Health-Check mit 4 parallelen Checks (DB / KEK / SigningKey-Coverage / Audit-Recency). Backup-Konzept und Pre-Deploy-Audit-Workflow als Doku.
- **SDK** (Phase 4): `@tropicsoft/license-sdk-js` mit drei Entry-Points (Core, `/node`, `/browser`). Auto-Binding (Installation-ID / Domain), drei Storage-Adapter (Memory/FS/IDB+localStorage-Fallback), Public-Keys-Discovery mit Cache + Grace-Fallback, Token-Verify mit Algorithm-Pinning, typed Errors mit `withinGracePeriod`-Info. Demo-CLI in `packages/sdk-js/demo/cli.ts` durchgespielt.
- **Token-Engine** (Phase 3): Ed25519 SigningKeys werden bei Product-Create automatisch erzeugt, Private-Keys via AES-256-GCM (envelope.ts) mit KEK verschlüsselt. JWT-Signing mit `jose` (Algorithmus EdDSA, Header mit `kid`, Claims `iss/aud/sub/iat/nbf/exp/jti` + Custom `licenseKey/features/bindings`). Token-Verification pinnt Algorithmus, verhindert `alg:none` und HS256-Confusion-Attacks.
- **Public-API** unter `/api/v1/*`: `POST /activate` (License-Key + Bindings → JWT), `POST /recheck` (JWT → erneuertes JWT oder Revocation-Signal), `POST /deactivate` (Activation freigeben, idempotent), `GET /.well-known/public-keys` (SPKI-PEM für alle Produkte, incl. rotierter Keys für Grace-Window). Rate-Limiting per IP-Hash: activate 10/min, recheck 60/min.
- **BindingPolicy**: `{required?:[…], maxPerType?:{…}}`. `applyBindings` enforced required types und per-type-Quota, resurrected released Activations bei Wiedersehen.

## Backlog (priorisiert)
1. **SMTP-Adapter** statt ConsoleMailSender — Drop-in mit nodemailer gegen tropicsoft-mailcow. Klein, kommt mit konkretem Mail-Account-Setup.
2. **Rate-Limiter auf Redis** für Multi-Instance-Deploy. Aktuell single-instance, kein akutes Problem.
3. **React-Bindings für SDK** (`@tropicsoft/license-sdk-js/react`) — wenn erste React-App das SDK clientseitig nutzt.
4. **KEK-Rotation-Skript** — wenn konkreter Anlass (Mitarbeiter-Wechsel, suspected leak).
5. **Display-Name-Backfill** für Pre-Phase-6-Aktivierungen — einmalig wenn der Optik-Mangel stört.
6. **Multi-Stage-Dockerfile `runtime`-Target** End-to-End-Build und -Push in eine Registry.
7. **GitHub Actions CI** wieder einbauen mit funktionierender Test-DB (war Phase 1 entfernt wegen Mail-Spam bei jedem Push).

---

## Phasen-Übersicht
1. **Foundation** — Monorepo, Next.js, Prisma, PostgreSQL, Docker, Admin-Auth, leeres Admin-UI-Grundgerüst
2. **Core-Datenmodell + Admin-CRUD** — Produkte, Kunden, Lizenzen anlegen und verwalten
3. **Token-Engine** — Ed25519-Key-Management, JWT-Signing, Activate/Recheck/Revoke-Endpoints
4. **SDK JS/TS** — Paket, Aktivierung, Cache, Re-Check, Offline-Validierung, Binding-Erfassung, Demo-Integration
5. **Audit + Härtung** — Audit-Logging, Rate-Limiting, Backup-Integration, Health-Checks
6. **Self-Service-Portal** — Kunden-Login, Lizenz-Selbstverwaltung (spätere Iteration, kein Sprintziel der Erst-Implementierung)

Detaillierte Task-Listen siehe `PHASEN.md`.
