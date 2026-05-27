# LOGBUCH — License Engine

Chronologisches Arbeitsprotokoll. Ein Eintrag pro Sitzung. Neueste Einträge oben.

---

## 2026-05-27 — Phase 1 Foundation komplett

### Implementierung
- **Monorepo:** pnpm-Workspaces mit `apps/server`, `packages/sdk-js`, `packages/shared-types`. Root-Skripte (`dev`, `build`, `lint`, `typecheck`, `test`, `format`, `admin:bootstrap`).
- **Tooling:** `tsconfig.base.json` (strict), `.prettierrc.json`, `.editorconfig`, `.nvmrc` (Node 20), pnpm 11.3.0 als packageManager. `pnpm-workspace.yaml` mit `allowBuilds` für Prisma/esbuild (pnpm-11-Sicherheits-Default).
- **apps/server:** Next.js 14.2 mit App Router, TypeScript strict, Tailwind 3, ESLint (`next/core-web-vitals`).
- **i18n (next-intl 3.26):** Default `de`, Fallback `en`. `localePrefix: as-needed`. Routing/Navigation/Request-Configs unter `src/i18n/`. Strings in `messages/de.json` + `en.json`.
- **Logging (pino 9):** zentraler `getLogger()`, Dev: `pino-pretty`, Prod: JSON. Redact für `authorization`, `cookie`, `*.password`, `*.token`.
- **Env (zod):** `src/lib/env.ts` validiert alle ENV-Variablen beim ersten Zugriff, refused-Start bei fehlendem `ENCRYPTION_KEY`/`ENCRYPTION_KEY_FILE`.
- **KeyProvider:** Interface `KeyProvider` + `EnvKeyProvider` + `FileKeyProvider`. File-Provider lehnt zu freizügige Mode-Bits in Prod ab. `decodeKeyMaterial` erzwingt exakte 32 Byte. Auflösungsregel `getKeyProvider()`: File > ENV.
- **Prisma 5.22:** Schema mit `AdminUser` (incl. `totpLastUsedStep` BigInt für Replay-Schutz, `role` Enum), `Product` (incl. `licenseKeyPrefix` default `TROP`, `jwtLifetimeHours` default 168), `ApiKey` (Hash + Scopes JSON). Initial Migration `20260527092225_init` läuft gegen Postgres 16.
- **Auth-Layer:**
  - `password.ts` — argon2id via `@node-rs/argon2`, OWASP-Parameter (19 MiB, 2 Runden), Konstant-Zeit-Verify mit `false` bei jedem Fehler.
  - `totp.ts` — `otplib`, Window ±1 Step (~90s Drift), Replay-Schutz via `lastUsedStep`-Bump pro erfolgreichem Login.
  - `rate-limit.ts` — Token-Bucket pro Email, 5 Tokens / 5 pro Minute Refill. Tag-1 in-memory, später Redis-fähig.
  - `config.ts` — NextAuth v4 Credentials Provider, JWT-Session 12h, Pages-Custom-Login. Uniform-Errors (kein User-Enumeration), Logger-Events für jeden Auth-Pfad.
- **UI-Stub:**
  - `/[locale]/page.tsx` — Public Landing mit Tagline.
  - `/[locale]/login` — Server-Page mit Suspense, Client-`LoginForm` (E-Mail + Passwort + 6-stelliger TOTP-Input mit `autoComplete="one-time-code"`).
  - `/[locale]/admin/layout.tsx` — Sidebar-Navigation (alle CRUD-Punkte disabled für Phase 1), Logout-Form, `getServerSession` als Defense-in-Depth zusätzlich zur Middleware.
  - `/[locale]/admin/page.tsx` — Dashboard-Stub mit `Welcome, {name}`-Begrüßung.
  - `middleware.ts` — kombiniert `next-intl` mit JWT-Schutz auf `/admin/*`.
- **API:**
  - `/api/auth/[...nextauth]` — NextAuth Catch-all.
  - `/api/health` — DB-Ping, `runtime: nodejs`, gibt `status`, `uptimeSeconds`, `database.ok`/`latencyMs` aus. 503 bei DB-Fail.
- **Bootstrap-CLI:** `scripts/bootstrap-admin.ts` (via `tsx`). Liest `ADMIN_BOOTSTRAP_EMAIL/PASSWORD` aus Env, verweigert wenn schon ein Admin existiert (keine offene Registrierung), gibt TOTP-Secret + otpauth-URL einmalig auf stdout aus.
- **Docker:** Multi-Stage `Dockerfile` (Targets `base/deps/dev/builder/runtime`), `docker-compose.yml` für lokales Dev (Postgres 16 + App-Hot-Reload). Postgres-Healthcheck wartet auf `pg_isready`.
- **Tests (Vitest 2.1):** 16 Tests grün — `key-provider` (Decode-Validation, Caching, Source-ID), `password` (Roundtrip + bad-hash-Resilience), `totp` (Accept/Reject/Replay), `rate-limit` (Bucket-Isolation, Capacity).
- **CI:** GitHub Actions Workflow `.github/workflows/ci.yml` — install, prisma generate, lint, typecheck, test auf jeden Push/PR auf `main`.

### Verifikations-Lauf
- Typecheck grün (alle 3 Workspaces).
- Lint grün.
- Tests: 16/16 grün.
- Build: alle 5 Routes + Middleware kompiliert.
- Postgres-Container hochgefahren, Initial-Migration `20260527092225_init` lief sauber.
- Bootstrap-CLI legt Owner-Account an, gibt TOTP-Secret aus.
- Dev-Server: `GET /api/health` → 200 mit DB-OK + Latenz, `GET /admin` (unauth) → 307 zu `/login?next=%2Fadmin`, `GET /login` → 200.

### Bewusst noch nicht gemacht
- Multi-Stage-Dockerfile `runtime`-Target: nicht End-to-End-gebaut/getestet. Compose-Dev mit App-Container ebenfalls noch nicht getestet (nur Postgres allein). Beide kommen bei nächstem Bedarf.
- Browser-Klick-Login mit echter Authenticator-App: bisher nur Route- und Programmatik-Verifikation. Sobald Jan mit einer Authenticator-App testen will, ist alles bereit.

### Nächster Schritt
- Commit + Push der Phase-1-Foundation.
- Auf Phase-2-Go warten (Core-Datenmodell vollständig + Admin-CRUD).

---

## 2026-05-27 — Projekt-Initialisierung + Architektur-Entscheidungen + Payment-Abgrenzung

### Setup
- Verzeichnis `license-engine/` angelegt, `git init -b main`.
- Initiale Projekt-Dateien erstellt: `CLAUDE.md` (Briefing), `LOGBUCH.md`, `PROJEKTSTATUS.md`, `CHANGELOG.md`, `PHASEN.md`, `.gitignore`, `.env.example`, `README.md`.
- Erster Commit: `chore: project initialization` (`90cadec`).
- Lokale git-Config gesetzt (`Jan Franke <jan@tropicsoft.de>`, `credential.helper osxkeychain`).
- Remote `origin` auf https://github.com/1castro/license-engine.git angebunden — Repo existiert leer auf GitHub.

### Architektur-Entscheidungen (Antworten Jan)
- **License-Key-Format:** Custom-Format `TROP-XXXX-XXXX-XXXX-XXXX` mit Checksum-Char pro Gruppe.
- **Master-Encryption-Key (KEK):** ENV ODER File, File hat Vorrang; `KeyProvider`-Interface vorbereitet für späteren KMS-Adapter.
- **JWT-Lifetime + Grace:** `exp = 7 Tage`, Re-Check 24h, Grace = `exp`. Pro Produkt konfigurierbar. Refresh-Token-Strategie bleibt als optionale `revocationStrategy = refresh`.
- **Logging:** `pino` mit JSON-Output ab Tag 1, getrennt vom Audit-Log in der DB.
- **Git-Remote:** GitHub-Repo direkt eingerichtet; CI als optionaler Phase-1-Task am Ende.
- **i18n:** `next-intl` Tag 1 mit DE Default, EN als Fallback-Stub.

### Payment/Billing-Nachtrag
- Neuer Abschnitt in `CLAUDE.md` aufgenommen: Payment ist explizit **nicht** Teil der License Engine. Spätere Anbindung via externes Sync-Modul (Stripe/Paddle).
- Datenmodell-Konsequenzen eingepflegt: `Customer.externalRef`/`externalSource`, `License.externalRef`/`externalSource`, `License.licenseKey` (UNIQUE), neue Entität `ApiKey` für Service-zu-Service-Auth.
- Lizenz-Create-Endpoint wird idempotent über `(externalRef, externalSource)`-Kombination.
- Admin-API klar getrennt: UI-Routen unter `/admin/*` (Session), programmatischer Zugriff unter `/api/admin/v1/*` (Session ODER API-Key + Scope).

### Doku-Updates
- `CLAUDE.md`: Repository-Header, Payment-Abgrenzung, Server-Block um JWT/License-Key/KEK erweitert, Tech-Stack um pino/next-intl, Datenmodell um externalRef/licenseKey/ApiKey, neue Section Service-zu-Service-Auth, API-Oberfläche in öffentlich/admin getrennt.
- `PHASEN.md`: Phase 1 um Logging, i18n, KeyProvider, CI erweitert. Phase 2 um externalRef-Felder, License-Key-Generator, Idempotenz, API-Key-Middleware. Phase 3 um `kid`-Claim, Algorithmus-Pinning-Test, Key-Rotation-Test. Phase 4 um Grace-Period-Info-Detail und License-Key-Format-Validierung.
- `infrastruktur/GITHUB.md`: Repo-Tabelle um `License Engine` ergänzt.

### Nächster Schritt
- Zweiter Commit mit allen Architektur-Updates, anschließend Push auf GitHub.
- Warten auf explizites „Go für Phase 1".
