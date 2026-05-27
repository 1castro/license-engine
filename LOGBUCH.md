# LOGBUCH — License Engine

Chronologisches Arbeitsprotokoll. Ein Eintrag pro Sitzung. Neueste Einträge oben.

---

## 2026-05-27 — Phase 4 SDK JS/TS komplett

### Package-Struktur
- `packages/sdk-js/` ist jetzt aktiv (war Phase-1-Skelett). Dependencies: `jose` (für Token-Verify), `@license-engine/shared-types`. DevDeps: `vitest`, `tsx`, `@types/node`.
- Drei Entry-Points via `exports`-Map in package.json:
  - `@tropicsoft/license-sdk-js` (Core, framework-agnostic)
  - `@tropicsoft/license-sdk-js/node` (FS-Storage + Installation-ID-Binding)
  - `@tropicsoft/license-sdk-js/browser` (IndexedDB + Domain-Binding)
- tsconfig: `lib:["ES2022","DOM"]`, `types:["node"]` — IDB-Typen + Node-Crypto im selben Workspace.

### Core (Bündel A-D)
- `types.ts`: `LicenseClientConfig`, `StorageAdapter`, `BindingInput`, `ActivateResponse`/`RecheckResponse`/`PublicKeyEntry`/`LicenseTokenClaims`, `ValidatedLicense`.
- `errors.ts`: `LicenseSdkError`-Hierarchie mit `LicenseInvalidKeyError` (Reason), `LicenseNotActiveError`, `LicenseRevokedError` (revokedAt), `LicenseExpiredError` (expiredAt), `BindingMismatchError`, `LicenseTokenInvalidError` (code), `ServerUnreachableError` (reason + withinGracePeriod + tokenExpiresAt).
- `license-key.ts`: Crockford-Base32-Validator + `normalizeLicenseKey`, 1:1 zum Server-Code, ohne Server-Deps. 6 Tests grün.
- `storage/memory.ts`: In-Memory-Map. `storage/filesystem.ts`: Node FS unter `~/.config/license-engine/<productSlug>/` (oder `$LICENSE_ENGINE_STATE_DIR`), Mode 0600, key-sanitization gegen Directory-Traversal. `storage/indexeddb.ts`: IDB mit localStorage-Fallback für Private-Mode.
- `discovery.ts`: `loadPublicKeys` cached unter `public-keys.v1` mit `serverUrl`-Tag, 24h TTL Default, fallback auf gestale Keys bei Server-Unerreichbarkeit. `PublicKeysFetchError` mit `status`-Code.
- `verify.ts`: `verifyLicenseToken` mit Header-Pre-Peek auf alg/kid (vor jose-Aufruf), Algorithmus-Pinning `EdDSA`, Multi-Key-Lookup per kid+productSlug, mapped jose-Errors auf `LicenseTokenInvalidError`-Codes (`expired`/`audience_mismatch`/`signature_invalid`/`malformed`/`unknown_kid`).
- `client.ts`: `createLicenseClient` mit `activate`/`validate`/`recheck`/`deactivate`/`clear`. State unter `license-state.v1` (licenseKey + productSlug + token + expiresAt + recheckIntervalHours + lastRecheckAt + bindings). `validate()` ruft opportunistisch `recheck()` wenn `lastRecheckAt + recheckIntervalHours <= now`; bei Server-Unerreichbarkeit aber gültigem Token kein Fehler (Grace-Period). Fetch mit AbortController-Timeout (Default 10s).
- `node.ts`: `createNodeLicenseClient` wired FS-Storage + auto-erzeugte UUID-Installation-ID als `installation`-Binding.
- `browser.ts`: `createBrowserLicenseClient` wired IndexedDB + `location.hostname` als `domain`-Binding.

### Tests (Bündel E)
- 13 SDK-Tests grün: license-key 6 (Phase-2-Key TR0P-VMY6-… als Roundtrip-Fixture, Crockford-Normalisierung, Checksum-Tippfehler-Reject), verify 4 (gültiger EdDSA-Token, `alg:none`-Reject, unknown kid-Reject, wrong audience-Reject), storage 3 (Memory-Roundtrip, FS-Persistence across Instances, Directory-Traversal-Reject).
- Insgesamt jetzt **93 Tests grün** (80 Server + 13 SDK).

### Demo-CLI (Bündel F) + E2E gegen lokalen Server
- `packages/sdk-js/demo/cli.ts`: Commands `activate <key>`/`validate`/`recheck`/`deactivate [value]`/`clear`. Env-Override `LICENSE_SERVER` + `LICENSE_PRODUCT_SLUG` + `LICENSE_ENGINE_STATE_DIR`. Catch-Mapping aller SDK-Error-Klassen auf lesbare CLI-Output + Exit-Code.
- Live-Run gegen `localhost:3000` mit Lizenz `TR0P-Y1C7-P3EY-A9AN-CHS0` (Product avatar-pro):
  1. `activate` → Token (766 Chars), expiresAt `2026-06-03T11:25:13Z`, features `[voice]`.
  2. `validate` → `refreshedFromServer=false` (Cache-Hit).
  3. `recheck` → `refreshedFromServer=true`, neuer Token (expiresAt 1s später).
  4. State persistiert in `/tmp/license-sdk-demo/license-engine/avatar-pro/{installation-id.v1, license-state.v1, public-keys.v1}`, alle Mode 0600.
  5. `deactivate cli-demo.example.com` → `released=true`.
  6. `activate TR0P-Y1C7-…-CHS5` (kaputte Checksum) → `License key invalid: group 4 checksum mismatch` (kein Server-Roundtrip!).
  7. `clear` + `validate` → `No cached activation — call activate() first.`

### Designentscheidungen
- Public Keys werden online geholt (statt build-time gebundled), damit Rotation ohne SDK-Redeploy greift.
- Drei Storage-Adapter (Memory/FS/IDB) statt einer abstrakten Default-Implementierung — die OS-spezifischen Bits liegen klar in `/node` und `/browser`, das `index` bleibt zero-OS-deps.
- License-Key-Validator dupliziert (statt shared-types-Move) — Tag-1-Pragma, da der Code stabil und sicherheitskritisch ist; Konsolidierung ist Kandidat für später.
- React-Bindings vertagt auf Phase 6, weil Self-Service-Portal der erste konkrete React-Use-Case wird.

### Nächster Schritt
- Phase-4-Bundle committen + pushen.
- Auf Phase-5-Go warten: Audit + Härtung (Audit-Log-Viewer im Admin-UI, Backup-Konzept, Rate-Limiter auf Redis heben, Health-Check-Verfeinerung, Brute-Force-Protection mit progressivem Backoff).

---

## 2026-05-27 — Phase 3 Token-Engine komplett

### Bundle A — Crypto + SigningKey-Service
- `src/lib/crypto/envelope.ts`: AES-256-GCM-Envelope (12-Byte-Nonce + Ciphertext + 16-Byte-Tag, base64-codiert). Encrypt/Decrypt nutzen KEK aus `KeyProvider`. 5 Tests: Roundtrip, Random-Nonce, Tampered-Tag-Reject, Tampered-Ciphertext-Reject, Too-Short-Blob.
- `src/lib/signing/signing-key-service.ts`: `generateAndStoreSigningKey` (Ed25519 via `jose.generateKeyPair`, Private als PKCS8-PEM envelope-encrypted, Public als SPKI-PEM plain, Transaktion: neuer Key + alte deaktivieren + Product.activeSigningKeyId setzen), `rotateSigningKey`, `getActiveSigningKey`, `getAllPublicKeysForProduct`, `listAllPublicKeys`. AuditLog `signing_key.created` / `signing_key.rotated`.
- `createProduct`-Hook ruft `generateAndStoreSigningKey` automatisch beim Anlegen eines Produkts auf — kein separater Admin-Klick nötig.

### Bundle B — Token-Service
- `src/lib/token/token-service.ts`: `signLicenseToken` (Header `alg:EdDSA`, `kid:<SigningKey.id>`, Claims `iss/aud=product.slug/sub=license.id/iat/nbf/exp/jti` + Custom `licenseKey/features/bindings`). `verifyLicenseToken` mit Header-Pre-Peek + Algorithmus-Pinning + Audience-Check + Multi-Key-Lookup (für Rotation-Grace). Typed `TokenVerificationError` mit Code-Klassen `invalid_signature/expired/malformed/unknown_kid/audience_mismatch`.
- 7 Tests: gültiger EdDSA-Token + matching Key, Reject `alg:none`, Reject HS256-Confusion-Attack (Public-Key als HMAC-Secret), Wrong-Audience-Reject, Expired-Reject, Wrong-Key-Reject, SPKI-PEM-Roundtrip.

### Bundle C — Binding + Activation
- `src/lib/binding/binding-policy.ts`: Zod-Schema `{required?: BindingType[], maxPerType?: Record<BindingType, number>}`, lenient (unbekannte Keys gedroppt für Forward-Compat mit Phase-2-Lizenzen). `assertRequiredBindingsProvided`, `maxActivationsFor`, typed `BindingPolicyViolationError`.
- `src/lib/binding/binding-hash.ts`: `hashBindingValue(type, value)` = SHA-256(`type:value`) — Type im Digest verhindert Cross-Type-Match.
- `src/lib/binding/activation-service.ts`: `applyBindings(license, incoming, ip)` (Policy-Check, Per-Binding-Lookup, Resurrect-released-Activation, Quota-Check vor Insert, AuditLog `activation.created` pro neuer Aktivierung). `releaseActivation(license, type, value, ip)` (idempotent, AuditLog `activation.released`).

### Bundle D — Public-API
- `POST /api/v1/activate`: License-Key validieren + normalisieren → License + Product laden → Status/Expiry-Check → `applyBindings` → JWT signieren + License-level AuditLog `activation.created`. Uniform 404 `license_not_active` für unbekannten Key, falsches Product oder revoked License (kein User-Enumeration).
- `POST /api/v1/recheck`: Product per slug laden → `verifyLicenseToken` (mit `kid`-Lookup) → bei `TokenVerificationError` 401 + AuditLog `token.verify_failed`. License-Status prüfen: `revoked`/`expired` → `{status:…}`-Antwort ohne neuen Token; sonst neuer Token mit gleichen Bindings.
- `POST /api/v1/deactivate`: Token verifizieren → `releaseActivation` aufrufen. Idempotent (`released:false` wenn bereits released).
- `GET /api/v1/.well-known/public-keys`: alle SigningKeys mit `kid/productId/productSlug/algorithm/publicKey(SPKI)/isActive/createdAt/rotatedAt`, Cache-Control 5min.
- Rate-Limiting: `activateLimiter` 10/min, `recheckLimiter` 60/min pro IP-Hash (in-memory Token-Bucket).

### Bundle E — Verifikation
- typecheck/lint/test (80 grün) + build (4 neue Public-Routes kompiliert).
- `scripts/phase3-bootstrap.ts` backfillt SigningKey für avatar-pro (Phase-2-Produkt ohne Key).
- E2E-curl gegen avatar-pro: Activate (Token kommt zurück, Payload korrekt) → Recheck (neuer Token, status:active) → Deactivate (released:true, zweiter Aufruf released:false) → Well-Known (1 Eintrag avatar-pro).
- Negativtests: wrong productSlug → 404, malformed Key → 400, tampered Token → 401 + Audit-Event, revoked License → `{status:"revoked"}`.
- AuditLog (Postgres): 4 Phase-3-Events sauber, IP-Hashes konsistent zu Phase 2, `actorType=anonymous` für public calls.

### Designentscheidungen
- Envelope-Encrypt: AES-256-GCM (authenticated encryption, kein separater MAC nötig).
- SigningKey-Erzeugung: automatisch beim createProduct (anstatt Admin-Button).
- BindingPolicy-Schema im Read-Pfad lenient (`.strip()`), für Forward-Compat.
- Binding-Hash: SHA-256(`type:value`), kein Salt (Werte sind opake Identifier).
- JWT-Lifetime: pro Produkt aus `jwtLifetimeHours` (Default 168 = 7d), iat/nbf/exp/jti immer gesetzt.

### Nächster Schritt
- Phase-3-Bundle committen + pushen.
- Auf Phase-4-Go warten: JS/TS-SDK (`@tropicsoft/license-sdk-js`) mit Activate/Validate/Recheck/Deactivate, Storage-Adapter, Offline-Validierung gegen die hier veröffentlichten Public-Keys, Grace-Period, Demo-Integration.

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
