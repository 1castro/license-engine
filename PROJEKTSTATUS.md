# PROJEKTSTATUS — License Engine

**Aktueller Stand:** **LIVE in Produktion (v1.1.0).** Phase 1–6 feature-complete + gehärtet + Seat-Management (Phase A) für App-Lizenzierung. Deployed auf `188.245.95.60`, erreichbar unter **https://license.tropicsoft.de**.

**Letztes Update:** 2026-05-28

**Nächster Schritt:** Erste reale App-Integration — Fahrdienst (PHP) gegen die Seat-API. Konzept + API-Vertrag: `docs/INTEGRATION.md`. App-Seite im Fahrdienst-Chat, Engine-Kontrolle hier.

---

## Deployment (Produktion)
- **URL:** https://license.tropicsoft.de (via NGX Proxy Manager → `license-engine:3000`, kein Host-Port).
- **Server:** `188.245.95.60`, Stack `/opt/stacks/license-engine/`, Code `/opt/license-engine/code/`.
- **Container:** `license-engine` (Next.js standalone) + `license-engine-db` (PostgreSQL 16, internes Netz, Volume `license-engine-db-data`). Beide healthy.
- **Update-Workflow:** lokal entwickeln → committen → `deploy/deploy.sh` (rsync + Build auf dem Server + Migrations-one-shot + recreate). Kein Image-Push.
- **Mail:** SMTP gegen mailcow (`licensing@tropicsoft.de`) aktiv.
- **Secrets:** ENCRYPTION_KEY/NEXTAUTH_SECRET/POSTGRES_PASSWORD in `/opt/stacks/license-engine/.env` (chmod 600). **ENCRYPTION_KEY ist im Bitwarden zu sichern — ohne ihn sind die Signing-Keys unwiederbringlich.**
- **Health:** `/api/health` extern abgeschirmt (404), intern Liveness `?level=live` für den Docker-Healthcheck.

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
- Vitest mit **129 Tests grün** insgesamt (111 Server + 18 SDK).
- **Production-Härtung** (Audit-Runden 1–3): Damm-Checksum (Server+SDK), Customer.email UNIQUE, TOTP- + Portal-Token-atomic-consume, applyBindings in Transaktion mit Row-Lock + Status-Re-Check, Recheck-Binding-Filter (released raus, Enum-Whitelist), License-Lazy-Expire + Cron, Security-Header (HSTS/CSP/X-Frame), `TRUST_PROXY_HEADERS`, Body-Size-Cap, Health-Endpoint extern abgeschirmt, Portal-Cookie SameSite=Strict.
- **Admin-UI**: Favicon (Schlüssel-Symbol) + Changelog-Modal (liest `CHANGELOG.md`, XSS-sicherer Renderer) in der Seitenleiste.
- **Self-Service-Portal** (Phase 6): eigener Customer-Auth-Pfad (Email + Argon2-Passwort), separater JWT-Cookie `le_portal_session`, Setup-Mail beim Customer-Create (Auto-Hook), Forgot-/Reset-Flow mit single-use Tokens (Hash-only-Storage), Portal-UI unter `/portal/*` mit Lizenz-Übersicht + License-Detail + Activation-Release per Inline-Modal. Aktivierungen zeigen sprechenden Display-Namen (`Domain — Jans Laptop (Dev)`) statt nur Hash.
- **Mail-Versand**: `ConsoleMailSender`-Stub Tag-2 (Inhalt im pino-Log); SMTP-Adapter folgt mit mailcow-Setup.
- **Audit + Härtung** (Phase 5): Audit-Log-Viewer im Admin-UI mit Filter + Pagination, Brute-Force-Backoff zusätzlich zum Token-Bucket, Key-Rotation-UI für Produkte, Health-Check mit 4 parallelen Checks (DB / KEK / SigningKey-Coverage / Audit-Recency). Backup-Konzept und Pre-Deploy-Audit-Workflow als Doku.
- **SDK** (Phase 4): `@tropicsoft/license-sdk-js` mit drei Entry-Points (Core, `/node`, `/browser`). Auto-Binding (Installation-ID / Domain), drei Storage-Adapter (Memory/FS/IDB+localStorage-Fallback), Public-Keys-Discovery mit Cache + Grace-Fallback, Token-Verify mit Algorithm-Pinning, typed Errors mit `withinGracePeriod`-Info. Demo-CLI in `packages/sdk-js/demo/cli.ts` durchgespielt.
- **Token-Engine** (Phase 3): Ed25519 SigningKeys werden bei Product-Create automatisch erzeugt, Private-Keys via AES-256-GCM (envelope.ts) mit KEK verschlüsselt. JWT-Signing mit `jose` (Algorithmus EdDSA, Header mit `kid`, Claims `iss/aud/sub/iat/nbf/exp/jti` + Custom `licenseKey/features/bindings`). Token-Verification pinnt Algorithmus, verhindert `alg:none` und HS256-Confusion-Attacks.
- **Public-API** unter `/api/v1/*`: `POST /activate` (License-Key + Bindings → JWT), `POST /recheck` (JWT → erneuertes JWT oder Revocation-Signal), `POST /deactivate` (Activation freigeben, idempotent), `GET /.well-known/public-keys` (SPKI-PEM für alle Produkte, incl. rotierter Keys für Grace-Window). Rate-Limiting per IP-Hash: activate 10/min, recheck 60/min.
- **BindingPolicy**: `{required?:[…], maxPerType?:{…}}`. `applyBindings` enforced required types und per-type-Quota, resurrected released Activations bei Wiedersehen.

## Erledigt seit Feature-Complete
- ~~SMTP-Adapter~~ — `SmtpMailSender` (nodemailer, mailcow) live.
- ~~Multi-Stage-Dockerfile `runtime`-Target~~ — deployed (Build auf dem Server, kein Registry-Push nötig).
- ~~Pre-Deploy-Audit + Härtung~~ — drei Audit-Runden, alle Blocker/Major gefixt.

## Backlog (priorisiert)
1. **Erste Test-Lizenzierung** — eine Web-Applikation als reales Testobjekt anbinden (nächster Schritt mit Jan).
2. **Rate-Limiter auf Redis** für Multi-Instance-Deploy. Aktuell single-instance, kein akutes Problem.
3. **React-Bindings für SDK** (`@tropicsoft/license-sdk-js/react`) — wenn erste React-App das SDK clientseitig nutzt.
4. **KEK-Rotation-Skript** — wenn konkreter Anlass (Mitarbeiter-Wechsel, suspected leak).
5. **Display-Name-Backfill** für Pre-Phase-6-Aktivierungen — einmalig wenn der Optik-Mangel stört.
6. **GitHub Actions CI** wieder einbauen mit funktionierender Test-DB (war Phase 1 entfernt wegen Mail-Spam bei jedem Push).
7. **NPM: `/api/health` zusätzlich proxy-seitig blocken** (Defense-in-Depth, optional — app-seitig bereits abgeschirmt).

---

## Phasen-Übersicht
1. **Foundation** — Monorepo, Next.js, Prisma, PostgreSQL, Docker, Admin-Auth, leeres Admin-UI-Grundgerüst
2. **Core-Datenmodell + Admin-CRUD** — Produkte, Kunden, Lizenzen anlegen und verwalten
3. **Token-Engine** — Ed25519-Key-Management, JWT-Signing, Activate/Recheck/Revoke-Endpoints
4. **SDK JS/TS** — Paket, Aktivierung, Cache, Re-Check, Offline-Validierung, Binding-Erfassung, Demo-Integration
5. **Audit + Härtung** — Audit-Logging, Rate-Limiting, Backup-Integration, Health-Checks
6. **Self-Service-Portal** — Kunden-Login, Lizenz-Selbstverwaltung (spätere Iteration, kein Sprintziel der Erst-Implementierung)

Detaillierte Task-Listen siehe `PHASEN.md`.
