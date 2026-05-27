# LOGBUCH — License Engine

Chronologisches Arbeitsprotokoll. Ein Eintrag pro Sitzung. Neueste Einträge oben.

---

## 2026-05-27 — Customer-Create idempotent nachgezogen

- `createCustomer` in `customer-service.ts` analog zu `createLicense` umgebaut: bei `externalRef` + `externalSource !== 'manual'` → erst `findUnique` über die unique-Constraint, bei Treffer return `{ customer: existing, created: false }`, sonst neu anlegen mit `{ customer: new, created: true }`.
- `customers/route.ts` POST liefert Status `201` (created) oder `200` (idempotent) basierend auf dem `created`-Flag. Der P2002-Catch bleibt als Defense-in-Depth gegen Race-Conditions (zwei parallele POSTs, die beide den `findUnique` passieren).
- Customer-Form (`res.ok`-Check) deckt bereits 200 und 201 ab — keine UI-Anpassung nötig.
- Verifikation per curl:
  - existing `cus_test_123` (aus Phase-2-Verifikation) → `200` mit existing Customer.
  - neuer `cus_new_456` → `201`.
  - Re-Call gleicher `cus_new_456` → `200` mit identischer Customer-ID.
- AuditLog: 3 `customer.created`-Einträge (1× admin aus Browser, 2× api_key aus curl), Re-Call hat KEINEN zusätzlichen Eintrag erzeugt — identisches Verhalten zu License.
- 68 Tests bleiben grün, typecheck + lint grün.

---

## 2026-05-27 — Phase 2 komplett

### Bündel A — Foundation
- Prisma-Schema um `SigningKey`, `Customer`, `License`, `Activation`, `AuditLog` erweitert. Migration `20260527100000_phase2_full_domain_model` via `prisma migrate diff` + `migrate deploy` (Prisma CLI verweigerte non-interactive auf einen `--unique`-Warning).
- License-Key-Generator `src/lib/license/license-key.ts`: Crockford-Base32-Alphabet ohne I/L/O/U, transparente Normalisierung (O→0, I/L→1, U→V) für Input, pro 4-er-Gruppe ein Check-Char unter Einbezug von Prefix + Group-Index. 21 Tests grün.
- Designentscheidung mit Jan bestätigt: Crockford bleibt, Prefix `TROP` wird kanonisch zu `TR0P` (Option A aus drei vorgelegten).
- AuditLog-Writer `src/lib/audit/` mit `writeAuditLog`, `hashIp` (HMAC-SHA256 aus `NEXTAUTH_SECRET` als Salt, keine neue ENV nötig), `extractIp` (X-Forwarded-For → X-Real-IP-Fallback), `scrubMetadata` (Defense-in-Depth gegen versehentlich geleakte Secrets in Metadata-Feldern). 10 Tests grün.

### Bündel B — API-Key-Layer
- `src/lib/auth/api-key.ts`: Format `lek_<32-base64url>`, SHA-256-Hash für DB-Lookup (nicht argon2, weil 192 Bit Entropie Brute-Force ausschließen — argon2 wäre Overkill und teuer pro Request).
- `src/lib/auth/api-key-middleware.ts`: `extractApiKeyPlaintext` (Bearer + X-API-Key), `authenticateApiKey` (Hash-Lookup + revoke-Check + `lastUsedAt`-Fire-and-Forget), `hasScope`.
- `src/lib/auth/admin-route-auth.ts`: zentraler `authorizeAdminRoute(req, { requireScope? })`-Wrapper für alle `/api/admin/v1/*`-Routes — Session zuerst, dann API-Key, sonst 401/403 als NextResponse.
- 21 Tests (API-Key + Middleware) grün.

### Bündel C — Services + Admin-API
- `src/lib/services/product-service.ts` als Vorlage selbst gebaut (Zod-Schemas, CRUD-Funktionen, AuditLog-Integration, `ProductInUseError` bei Delete mit referenzierten Lizenzen).
- `/api/admin/v1/products/route.ts` und `[id]/route.ts` als Route-Vorlage. Auth via `authorizeAdminRoute` mit `requireScope: 'products:read'`/`'products:write'`. Prisma-Error-Mapping (P2002 → 409, P2025 → 404).
- Sub-Agent gebaut: `customer-service.ts`, `license-service.ts` (mit Idempotenz, License-Key-Retry bei UNIQUE-Kollision, `revokeLicense`, typed Errors), `api-key-service.ts`. Plus die zugehörigen Routen unter `/api/admin/v1/customers`, `/api/admin/v1/licenses` (inkl. `[id]/revoke`), `/api/admin/v1/api-keys`. typecheck + lint grün.

### Bündel D — Admin-CRUD-UIs
- shadcn-Foundation manuell aufgesetzt: Radix-Primitives, `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react@0.469`, `react-hook-form@7`, `@hookform/resolvers@3`, `tailwindcss-animate` — alles mit pinned Versions. `components.json`, `src/lib/utils.ts` (cn), `tailwind.config.ts` und `globals.css` mit CSS-Variablen.
- shadcn CLI 4.x verworfen (zieht `@base-ui/react` Beta + falsche lucide-Version 1.16), 2.4 erfordert Tailwind v4. Manuelles Setup als Workaround.
- Sub-Agent gebaut: 13 shadcn-UI-Komponenten (`button`, `input`, `label`, `textarea`, `card`, `dialog`, `select`, `checkbox`, `badge`, `alert`, `table`, `form`, `dropdown-menu`), 14 Admin-Pages und Dialog-Komponenten, i18n-Sections `products`/`customers`/`licenses`/`apiKeys`/`errors`. Sidebar im Admin-Layout aktiviert für die vier neuen Bereiche. typecheck, lint, build grün.

### Bündel E — Verifikation
- `pnpm typecheck`, `pnpm lint`, `pnpm test` (68 grün), `pnpm build` (alle Routes kompilieren).
- Chrome-DevTools-End-to-End:
  - Login mit TOTP (mit Replay-Schutz, schon aus Phase 1).
  - Produkt `avatar-pro` angelegt → Prefix wurde sichtbar zu `TR0P` normalisiert.
  - Kunde `Maria Tester` angelegt.
  - Lizenz erzeugt → Generator-Output `TR0P-VMY6-HKMY-BRXP-19X4`. Feature-Flags-Auswahl wird dynamisch aus dem gewählten Produkt geladen, BindingPolicy als JSON-Textarea akzeptiert.
  - Lizenz via Revoke-Dialog widerrufen, Status in Liste auf „Widerrufen".
  - API-Key `stripe-sync-modul (test)` mit Scopes `customers:write`, `licenses:write`, `licenses:revoke` angelegt, Plaintext `lek_<redacted>` einmalig im Dialog mit Copy-Button + Warnung.
- API-Verifikation per curl:
  - `GET /customers` ohne Auth → 401, mit Key aber ohne `customers:read` → 403 mit klarer Message, mit malformed Key → 401.
  - `POST /customers` mit Key + Scope → 201 (Erfolg).
  - **License-Idempotenz scharf:** zwei Calls mit `(externalRef=sub_abc123, externalSource=stripe)` → erst 201 Created, dann 200 OK mit identischer License-ID + identischem Key.
- `apiKey.lastUsedAt` nach den curl-Calls aktualisiert (UI-Liste nach Reload).
- AuditLog (Postgres direkt gequeryt): 7 Einträge sauber, korrektes `actorType`-Switching admin↔api_key, alle IPs gehasht (kein Klartext), idempotenter Re-Call hat KEINEN neuen Audit-Eintrag erzeugt.

### Abweichung vom Briefing
- `Customer`-Create ist nicht idempotent (gibt 409 statt 200+existing). Briefing forderte Idempotenz explizit nur für License. Falls Sync-Modul es später braucht, 1:1 nach License-Pattern erweiterbar.

### Was nicht gemacht wurde (bewusst)
- Multi-Stage-Dockerfile `runtime`-Target weiterhin nicht End-to-End-gebaut.
- Keine Integration-Tests gegen die Live-DB für die Service-Layer. Aktuell sind alle Unit-Tests stub-frei und nutzen real-crypto / real-zod, aber Service-Methoden mit Prisma-Calls sind nur über das End-to-End-curl- und Browser-Setup verifiziert. Echte Integration-Tests gegen eine Test-DB wären ein eigener Vitest-Setup-Block.

### Nächster Schritt
- Phase-2-Bundle committen + pushen.
- Auf Phase-3-Go warten (Ed25519-Key-Management, JWT-Signing, Activate/Recheck/Deactivate-Endpoints, Public-Keys-Discovery, Rate-Limiting).

---

## 2026-05-27 — GitHub Actions CI wieder entfernt

- `.github/workflows/ci.yml` aus Phase 1 wieder gelöscht (User-Entscheidung).
- Hintergrund: Workflow lief bei jedem Push, schlug fehl (vermutlich an pnpm-11-`allowBuilds`-Syntax oder Workspace-Test-Reihenfolge), generierte Mail-Spam. Vorher nicht remote-verifiziert, weil `gh` CLI lokal nicht installiert ist.
- Lessons learned: CI nur einbauen, wenn explizit angefordert — Phase-1-Briefing-Antwort A war „CI ergänzt aber blockiert nicht", was ich zu eng ausgelegt hatte.
- Reaktivierung später (Phase 5 oder gemeinsam mit dem Audit-Workflow), dann mit Repo-Walkthrough vor dem Merge.

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

### Browser-End-to-End-Verifikation (Chrome DevTools, nachgereicht)
- `/` → deutsche Landing-Page, Klick „Admin" → Redirect zu `/login?next=%2Fadmin`.
- Login-Form mit `jan@tropicsoft.de`, Bootstrap-Passwort und frisch generiertem TOTP-Code → erfolgreicher Redirect zu `/admin`, Sidebar + „Willkommen, jan@tropicsoft.de." sichtbar.
- Logout via Sidebar-Button → NextAuth-Signout-Bestätigung → zurück zu `/login`.
- **Replay-Schutz verifiziert:** erneuter Login-Versuch mit demselben TOTP-Code → abgelehnt, uniform Error „E-Mail, Passwort oder TOTP-Code falsch.", URL bleibt `/login`.
- Erneuter Login mit frisch generiertem Code → wieder erfolgreich.
- Server-Log-Sequenz exakt wie erwartet: `admin.login.success` → `admin.login.bad_totp` → `admin.login.success`.
- Screenshot des Dashboards unter `docs/screenshots/phase1-admin-dashboard.png` abgelegt.

### Bewusst noch nicht gemacht
- Multi-Stage-Dockerfile `runtime`-Target: nicht End-to-End-gebaut/getestet. Compose-Dev mit App-Container ebenfalls noch nicht getestet (nur Postgres allein). Beide kommen bei nächstem Bedarf.

### Nächster Schritt
- Commit + Push der Phase-1-Foundation inklusive Browser-Verifikation und Screenshot.
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
