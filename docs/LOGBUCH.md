# LOGBUCH — License Engine

Chronologisches Arbeitsprotokoll. Ein Eintrag pro Sitzung. Neueste Einträge oben.

---

## 2026-05-29 — Fehlversuch-Protokoll + Integrationstest-Infra + Audit-Retention + Deploy v1.3.0

Großer Härtungs-Block (alles License-Engine, vor erster echter App-Integration). Drei Themen, jedes mit Pre-Deploy-Audit (Workflow, 3 Dim + adversariale Verifikation) + Fix-Runde + Re-Check.

**Deploy v1.3.0 (gebündelt):** shared-types + Fehlversuch-Protokoll + Test-Infra + Retention live auf license.tropicsoft.de. Erster Build scheiterte (shared-types-`dist` fehlte — stale `tsconfig.tsbuildinfo` übersprang den tsc-Emit, erste Build-Konstellation seit der Zentralisierung); Fix: clean vor Emit im build-Script + `.dockerignore`-Hygiene. Zweiter Deploy grün, Container healthy, externer Smoke-Test (portal/admin/login 200, public-keys 200, health extern 404, admin-API 401) bestanden. **Doku konsolidiert** (10 → 3 Root + 4 docs/). **Offen (Ops): Server-Cron** für `audit:prune` + `licenses:expire` noch einzurichten.

**1. Fehlversuch-Protokoll** (Commits `0a07b3d` + Audit-Fixes `16813d7`): Abgewiesene Aktivierungen (`activation.rejected`) werden jetzt an allen fachlichen Ablehnungspfaden von activate erfasst (ungültiger Key, unbekannte/inaktive/abgelaufene Lizenz, Limit, Pflichtbindung) — Transport-Rauschen bewusst nicht. Sichtbar: Dashboard (war leer → Kennzahlen + aktive-Lizenzen-Liste + wegklickbares Banner), Lizenz-Detailseite (Detail-Tabelle), Kundenportal (schlichter Hinweis, nur Anzahl). Audit-Fund (major): Label "Nicht autorisierte Domain" war fachlich falsch (keine Allowlist, nur Limit) → "Domain-Limit erreicht".

**2. Integrationstest-Infrastruktur** (`fad4366`): Erstmals echte Route-Handler gegen echtes Postgres (Wegwerf-DB Port 5433, `docker-compose.test.yml`, `pnpm test:integration`, getrennt von der DB-freien Unit-Suite). **16 Integrationstests** sichern die sicherheitskritischen Pfade ab: Seat-Limit→409, Quota-beim-Reaktivieren (Anti-Churn), Reject-Audit (positiv+negativ), revoked/expired-Lizenz, Multi-Tenant-Isolation (fremde Lizenz→404), Admin-Session-Bypass, Privilege-Escalation-Sperre. Damit ist die B1/B2-Härtung aus dem v1.2.0-Audit automatisch abgedeckt.

**3. Audit-Log-Retention** (`fad4366` + Audit-Fixes `6992236`): differenziertes Pruning (`audit:prune`-Cron-Skript) — Sicherheits-/Forensik-Events 365 Tage (ENV `AUDIT_RETENTION_CRITICAL_DAYS`), Routine 90 Tage (`AUDIT_RETENTION_ROUTINE_DAYS`). Audit-Fund (major): fehlende Invariante criticalDays≥routineDays → bei Vertauschung würden Forensik-Events FRÜHER gelöscht → harte Prüfung in pruneAuditLog + env-`.refine` (fail-fast). Robustheit: explizite ROUTINE+CRITICAL-Allowlists (unbekannte Events werden NIE gelöscht, fail-safe); alle 26 Event-Typen genau einer Klasse zugeordnet (maschinell verifiziert).

**Filter/Sortierung/Datum** im Audit-Viewer existierten bereits — nur das Pruning fehlte. **Settings-Tab** bleibt bewusst ausgegraut (Platzhalter für Admin-Account-Verwaltung, später).

Gesamt: typecheck/lint/**132+18 Unit + 16 Integration**/Build grün. Kein Schema-Change → keine Migration. **Offen (nit):** Sanity-Cap/Dry-Run im prune-Skript (durch Invariante+Allowlist entschärft). **Offen (Ops):** `audit:prune` + `licenses:expire` brauchen einen Server-Cron-Trigger (beim Deploy einzurichten).

---

## 2026-05-29 — shared-types: Wire-Typen zentralisiert

Den im Voll-Audit bewusst zurückgestellten Punkt nachgeholt (auf Jans Wunsch — saubere Basis, bevor mehrere JS/TS-Apps das SDK einbinden). Die Over-the-wire-Typen waren server- und SDK-seitig dupliziert (stimmten überein, konnten aber künftig still divergieren). Jetzt eine Quelle der Wahrheit in `@license-engine/shared-types`:
- `ActivateResponse`, `RecheckResponse`, `SeatInfo`, `PublicKeyEntry`, `BindingType`, `BindingInput`, `LicenseTokenClaims`, `LicenseTokenBinding` zentral.
- SDK re-exportiert sie aus shared (SDK-interne Typen bleiben lokal); Server importiert + re-exportiert sie (bestehende Modul-Importe unverändert). `LicenseTokenClaims = WireClaims & jose.JWTPayload` (Sign/Verify-Kopplung erhalten).
- activate/recheck-Responses mit `satisfies` gegen den Wire-Vertrag geprüft → Abweichung knallt beim Compile.
- Divergenz bereinigt: `LicenseTokenBinding.type` war serverseitig `string`, jetzt einheitlich `BindingType`.
- Reiner Typ-Refactor, kein Laufzeitverhalten. typecheck/lint/132+18 Tests/Build grün. Docker-Build baut shared-types bereits vor dem Server (kein Pipeline-Eingriff nötig). Commit `6b5f584`. Noch nicht deployt (kein Verhaltensänderung — geht beim nächsten funktionalen Deploy mit).

**Pre-Deploy-Audit (Workflow, Scope `6b5f584`):** Drei Dimensionen (Code/Logik/Security) parallel + adversariale Verifikation jedes Findings (9 Agenten). 6 Rohfindings → 4 als Fehlalarm verworfen, 2 bestätigt, **beide nur nit**: (1) `sdk-js`-Lint ist ein Stub (Vorzustand, off-scope, durch typecheck abgedeckt); (2) `LicenseTokenClaims`-Intersection empirisch als semantisch identisch zur alten `extends JWTPayload`-Variante bestätigt (kein Wire-/Verhaltens-Unterschied). **Status: grün** — keine Blocker/Major/Minor. Wiederverwendbarer Workflow `pre-deploy-audit` (Skript persistiert).

---

## 2026-05-28 — Portal-Self-Service-Feinschliff + Voll-Audit & Härtung (v1.2.0)

### Teil 1 — Portal-Self-Service laientauglich (deployed)
Strategische Festlegung: Seat-/Lizenzverwaltung läuft **zentral über das Kunden-Portal**, integrierte Apps bekommen kein eigenes Lizenz-Panel (SaaS-Standard, für alle künftigen Apps). Daher Portal aufgehübscht:
- Aktivierungs-Ansicht (Portal): **Tabs** pro Bindungstyp (statt langem Scrollen), **Name + Kürzel als getrennte Tabellenspalten**, „Plätze"-Übersicht oben in der Lizenz-Karte, Firmenname im Header, Warnzeile zum sorgsamen Umgang mit der Lizenznummer. Domain read-only.
- `recheck` bumpt jetzt `lastSeenAt` → „zuletzt aktiv" spiegelt laufende Nutzung (Granularität = Recheck-Intervall), kein Audit-Logging. Commit `26e1fb8` + Folge-Commits.
- Vorab in dieser Session bereits: Seat-Editor im Lizenz-Formular, gruppierte Aktivierungs-Ansicht + Suche/Paginierung, Setup-Mail-Resend (Commits `873446c`–`26e1fb8`).

### Teil 2 — Voll-Audit über die GESAMTE Anwendung (vor erster echter Integration)
Auf Wunsch (Sicherheit vor Anbindung des ersten echten Mandanten) drei Voll-Audit-Agenten (Security/Logik/Code) über die ganze App. Kernbefund: Fundament solide (Crypto/JWT-Pinning, Activate-Row-Lock, Admin-Login, öffentliche Endpoints, app-agnostischer Kern), aber **2 Blocker + mehrere Majors** in der jüngsten Multi-Mandanten-API-Key-Schicht. Komplett-Fix-Batch (32 Dateien) umgesetzt:

- **B1 (Blocker)** Multi-Tenant-Isolation: `enforceLicenseAccess` ergänzt auf `GET /licenses` (gebundener Key → nur eigene Lizenz), `GET/PATCH /licenses/[id]`, `revoke`.
- **B2 (Blocker)** API-Key-Privilege-Escalation: API-Key-Verwaltung (`/api-keys`) nur noch per Admin-Session (`requireAdminSession`), API-Key-Aktoren 403.
- **F1 (Major, vom Re-Audit gefunden)** + **F2**: gebundene Keys konnten via `POST /licenses` fremde Lizenzen erstellen bzw. mit cross-tenant-Scopes enumerieren → **Scope-Whitelist `LICENSE_BOUND_ALLOWED_SCOPES`** (nur `licenses:read`/`activations:read`/`activations:write`) bei Key-Erstellung + Defense-in-depth-Block in `POST /licenses`.
- **Q (Major)** Seat-Limit umgehbar: Quota-Check beim Reaktivieren eines freigegebenen Slots (release+reactivate-Churn) — `applyBindings` prüft `maxPerType` jetzt vor beiden Zweigen.
- **m6** einheitliche `500 internal_error`-Hülle auf activate/recheck/deactivate (SDK las rohe 500 sonst als license_not_active). **M3** Produkt+Signing-Key transaktional (Kompensation, Logging). **m5** deterministischer aktiver Signing-Key.
- **Sec-M1** Portal-JWT eigenes, aus `NEXTAUTH_SECRET` per HMAC abgeleitetes Secret + `iss`/`aud`-Pinning. **Sec-M2** Rate-Limit auf reset/setup-password + Session-Invalidierung (`Customer.portalSessionsValidAfter`, gebumpt bei Passwort set/reset) + `emailVerifiedAt` bei Reset.
- **Widerruf-Timing** (Design-Call): Default `jwtLifetimeHours` 168→**48**, `recheckIntervalHours` 24→**12** (online-Widerruf ≤12h, Offline-Grace ≤48h; pro Produkt tunebar). Bestehende Produkte behalten ihre Werte.
- **SDK released-binding** (Design-Call): recheck-Fall „alle Bindings freigegeben" liefert eigenen Code `bindings_released`; SDK wirft `BindingsReleasedError` + räumt den Cache → App kann sauber neu aktivieren. Für REST-Apps (Fahrdienst): bei `bindings_released` einfach `activate` neu.
- **featureCatalog** (Design-Call): `featureFlags` werden gegen `Product.featureCatalog` validiert (Subset, sonst 400). ODER-Bindung bleibt bewusst nicht implementiert (nur UND), dokumentiert.
- **Minors**: customerId-Vorprüfung, Portal-Login-Audit-Events (`customer`-ActorType, DSGVO nur ipHash), revoke gibt Seats frei (Transaktion), ApiKeyUsed-Deadcode entfernt.

**3 additive Migrationen**: `portalSessionsValidAfter` (nullable), Token-Default-Änderung (nur neue Produkte), `AuditActorType += customer`. **MÜSSEN vor dem App-Deploy laufen.**

**Verifikation**: typecheck/lint grün, **132 Server- + 18 SDK-Tests grün** (+3 requireAdminSession-Negativtests), build grün. Re-Audit (3 Agenten) der Fixes: Logik + Code grün; Security grün bis auf F1/F2 → nachgefixt (Scope-Whitelist) + Fokus-Recheck.

**Bewusst zurückgestellt**: `shared-types`-Zentralisierung (Wire-Typen sind heute konsistent; breiter Refactor ohne aktuellen Bug — nicht in den Security-Batch gezogen).

**Offene Design-Grenze (dokumentiert, F2)**: Die Lizenz-Bindung wirkt nur auf Lizenz-/Aktivierungs-Routen. Gebundene Mandanten-Keys dürfen ausschließlich Scopes aus `LICENSE_BOUND_ALLOWED_SCOPES` erhalten (per Whitelist erzwungen) — niemals `customers:*`/`products:*`/`audit:read`.

---

## 2026-05-28 — Phase A: Seat-Management für App-Lizenzierung (v1.1.0)

Engine-Seite für seat-basierte App-Lizenzierung (erster Testfall Fahrdienst, account-basiert). Konzept: `docs/INTEGRATION.md`. Genehmigter Plan, in 6 Schritten umgesetzt.

- **A1 Seat-Zahlen**: `getSeatUsage(licenseId, policy)` (zählt aktive Activations pro policy-relevantem Typ), `seats`-Array in activate + recheck, SDK-Typen erweitert.
- **A2/A3 Verwaltung + API**: `listActivationsForLicense` + `releaseActivationById` (idempotent, lizenz-scoped, Audit). Neue Endpoints `GET /api/admin/v1/licenses/[id]/activations` + `POST .../[activationId]/release`, Scopes `activations:read/write`.
- **A4 Mandanten-Isolation**: `ApiKey.licenseId` (nullable FK, additive Migration `20260528103025`), `enforceLicenseAccess` (gebundener Key → fremde Lizenz = 404). API-Key-Create unterstützt Bindung.
- **A5 Admin-UI**: `/admin/licenses/[id]/activations` (Auslastung + Liste + Release-Modal), Link im Row-Dropdown, i18n-Namespace `activations`.

**E2E lokal verifiziert**: activate account:2 → 2 ok + seats, 3. → 409; GET/release per gebundenem API-Key; Release gibt Platz frei → Re-Aktivierung; fremde Lizenz → 404; ohne Key → 401.

**Pre-Deploy-Audit (3 Agenten)**: Security GRÜN; Code + Workflow je 1 Major gefixt:
- FK-Violation bei API-Key-Create mit ungültiger licenseId → jetzt 400 statt 500 (Vorab-Prüfung `license.findUnique`).
- `docs/INTEGRATION.md` auf das tatsächliche `seats`-Array-Format korrigiert (statt seatsUsed/seatsMax).
- Minor: `getSeatUsage` zählt Typen parallel (Promise.all).

**Status: grün → deployed** (Commits `b76fcc0` + `0c4291e`). Migration in Prod angewandt, App healthy, `/admin/login` 200, neue Endpoints ohne Auth → 401.

**Offen (Follow-up, kein Blocker)**: DB-Integration-Tests für Seat-Limit/Resurrection (Projekt hat noch keine DB-Test-Infra); App-Seite (Fahrdienst) folgt in eigenem Chat gegen diese API.

---

## 2026-05-28 — Post-Deploy: Health-Abschirmung, Favicon, Changelog-UI, Dockge-Fix

### Health-Endpoint abgeschirmt (Shared-Token)
- `/api/health` ist von außen nur mit `HEALTH_CHECK_TOKEN` erreichbar (Header `x-health-token` oder `?token=`), sonst 404 — von außen unsichtbar. Der Docker-Healthcheck + Monitoring senden den Token.
- Erster Ansatz (Gate auf `x-forwarded-*`) verworfen: der Next.js standalone-Server setzt **alle** `x-forwarded-*` Header selbst (auch bei localhost), also war der interne Healthcheck ebenfalls 404 → Container nie healthy. Token ist der einzige verlässliche intern/extern-Diskriminator.
- Verifiziert nach Deploy: intern+Token 200, intern ohne Token 404, extern (Domain) 404, öffentliche API (`/api/v1/.well-known/public-keys`) + `/admin/login` 200, Favicon (ico/svg/png) 200.

### Favicon
- `app/icon.svg` (Schlüssel-Symbol, blauer Gradient) + generiertes `favicon.ico` (16/32/48) + `apple-icon.png` (180) via `rsvg-convert`. Next.js App Router bindet alle drei automatisch ein. Im Browser verifiziert (Login-Seite, alle drei 200 + korrekte Content-Types).

### Changelog in der Admin-UI
- `CHANGELOG.md` versioniert nach Keep a Changelog (1.0.0 = Production-Release, 0.1.0–0.6.0 = Phasen).
- Seitenleisten-Eintrag „Changelog" öffnet ein Modal, das `CHANGELOG.md` zur Laufzeit liest und mit einem eigenen, XSS-sicheren Markdown-Renderer (React-Elemente, kein `dangerouslySetInnerHTML`) darstellt. Renderer per Unit-Test abgesichert (inkl. HTML-Escaping-Test). `CHANGELOG.md` wird ins Image kopiert (`.dockerignore`-Ausnahme).

### Dockge-/Container-Verwaltung repariert
- `image: license-engine:latest` ließ Dockge beim Start/Update versuchen, das (nur lokal gebaute) Image zu pullen → „pull access denied". Fix: `pull_policy: never` + Watchtower-Exclude-Label. Start/Recreate/.env-Neuladen aus Dockge funktionieren wieder.
- Migrations-Service ins `migrate`-Profile → kein dauerhaft „exited" Container, Dockge zeigt den Stack als aktiv.
- `next.config.mjs`: `outputFileTracingRoot` nach `experimental` verschoben (Next 14 erkennt es sonst nicht; Build lief bisher nur dank Auto-Detection).

### Status
- typecheck/lint/test/build grün (111 Server- + 18 SDK-Tests). Deploy nach Pre-Deploy-Audit (Runde 3).

---

## 2026-05-28 — Production-Deploy auf 188.245.95.60 (license.tropicsoft.de)

### Deploy-Architektur (mit Jan abgestimmt)
- Eigener Compose-Stack `/opt/stacks/license-engine/` (compose.yaml + .env, chmod 600), Code unter `/opt/license-engine/code/`.
- Zwei Container in einem Stack: `license-engine` (Next.js standalone) + `license-engine-db` (PostgreSQL 16, nur internes Netz, eigenes Volume). Kein Host-Port — Zugriff nur über NGX Proxy Manager im `reverse-proxy`-Netz auf `license-engine:3000`.
- Update-Strategie A: Code per `deploy/deploy.sh` rsyncen, auf dem Server bauen (Layer-Cache), kein Image-Push. Migrations als one-shot vor App-Start.

### Build-Hürden auf dem Server (lokal nicht sichtbar)
- node:20 → node:22-alpine (pnpm 11.3 braucht Node ≥ 22.13), `corepack@latest`, `apk add openssl` (Prisma-Engine), Build-Zeit-Platzhalter-ENV für `next build`, fragile `COPY node_modules/.prisma` entfernt (pnpm-Layout).

### Inbetriebnahme
- ENCRYPTION_KEY/NEXTAUTH_SECRET/POSTGRES_PASSWORD frisch auf dem Server generiert (nie durch den Chat). Admin-Bootstrap durch Jan (TOTP). SMTP gegen mailcow aktiv (Verbindungstest grün).
- Externer Smoke-Test grün: `/` + `/admin/login` = 200, Security-Header durch den Proxy.

### Commits
- `a6872d7` Production-Deploy-Setup, `12185ce` Dockerfile-Fixes, `47ef2f5` migrate-Profile, `63665ae` pull_policy/Watchtower.

---

## 2026-05-27 — Pre-Deploy-Audit + Härtung (Audit-Workflow)

### Audit-Runde 1 — Scope: Code-Stand nach Phase 6 + SMTP (vor `d595c93`)
Drei Audit-Agenten (Code / Workflow / Security). Ergebnis: **4 Blocker + 11 Major + ~15 Minor**.
- Blocker: License-Key-Checksum auf Damm-Algorithmus (Server+SDK), Customer.email UNIQUE + Normalisierung, TOTP atomic compare-and-set, Portal-Auth-Token atomic consume.
- Major: applyBindings in Transaktion mit Row-Lock, verifyLicenseToken-Negativtests, Recheck liefert `recheckIntervalHours`, Recheck filtert released Bindings, Idempotenz auch bei `manual`+externalRef, License-Expiry (Lazy + Cron), Security-Header, `TRUST_PROXY_HEADERS`, Body-Size-Cap + bindings.max.
- Alle Blocker + Major gefixt → Commit `d595c93`. **Status: grün.**

### Audit-Runde 2 — Scope: `d595c93` (vor `be31178`)
Re-Audit. Workflow + Security grün, Code-Audit fand **3 Major**:
- License-Status-Re-Check innerhalb der applyBindings-Transaktion (Race zwischen Read und Lock).
- BindingType-Whitelist im Recheck-Filter (sonst 500 bei unbekanntem Enum-Wert).
- SDK-verify auf jose-Error-Klassen (statt Message-Regex). Plus Flow-9 (alle Bindings released → 403).
- Gefixt → Commit `be31178`. **Status: grün.**

### Audit-Runde 3 — Scope: Deploy-Artefakte (vor `a6872d7`)
DevOps-/Workflow-/Security-Audit der compose.yaml/Dockerfile/deploy.sh. Workflow + Security grün, DevOps **1 Blocker + 1 Major**:
- Blocker: Container-Healthcheck hing am degradierbaren Mail-Check (503) → Liveness-Pfad `?level=live` eingeführt.
- Major: migrate-Service brauchte `env_file` für den Bootstrap-Lauf.
- Gefixt → Teil von `a6872d7`. **Status: grün → Deploy freigegeben.**

---

## 2026-05-27 — Phase 6 Self-Service-Portal komplett

### Bündel A — Schema-Erweiterung
- `Customer` um `passwordHash`, `emailVerifiedAt`, `portalLastLoginAt` erweitert (alle nullable, kein Bruch der bestehenden Records).
- Neue Tabelle `CustomerAuthToken` mit purpose-enum (`set_initial_password` / `reset_password`), Hash-only-Storage, TTL 72h (Setup) bzw. 2h (Reset). Migration `20260527120000_phase6_portal_auth`.

### Bündel B — Mail-Versand
- `MailSender`-Interface + `ConsoleMailSender` als Tag-2-Stub (Mail-Inhalt im pino-Log auf INFO).
- `buildSetupPasswordMail` + `buildResetPasswordMail` (deutsch).
- SMTP-Adapter gegen tropicsoft-mailcow ist ein eigener kleiner Folgeschritt.

### Bündel C — Portal-Auth-Service
- `auth-token.ts`: `issueAuthToken` (mit Auto-Invalidation alter Tokens derselben purpose) + `consumeAuthToken` mit typed `AuthTokenInvalidError`.
- `session.ts`: JWT-Cookie `le_portal_session` (HS256 mit NEXTAUTH_SECRET, 30d, HttpOnly+Secure-in-prod+SameSite=Lax).
- `auth-service.ts`: `sendSetupMail`, `sendResetMail` (mit Enumeration-Defense — Antwort immer gleich), `setInitialPassword`, `resetPassword`, `loginCustomer` (Argon2-Dummy für unbekannte Email = Konstant-Zeit-Verify).

### Bündel D+E — Portal-API + Pages + Hook
- API: `POST /api/portal/v1/{login, logout, forgot-password, setup-password, reset-password, activations/[id]/release}`.
- Login nutzt existierenden `loginLimiter` + `loginBackoff` mit `portal:`-prefixiertem Key (saubere Domain-Trennung gegen Admin-Login).
- `portalForgotLimiter` neu (3/min pro (email, IP-Hash)).
- Pages unter `/portal/*`: `/portal/login`, `/portal/forgot`, `/portal/setup?token=…`, `/portal/reset?token=…`, `/portal` (Dashboard), `/portal/licenses/[id]`. Eigenes `app/portal/layout.tsx` ohne next-intl-Wrapping, eigene html/body.
- Hook in `createCustomer`: fire-and-forget `sendSetupMail` mit Catch-Log.

### Middleware-Fix
- `/portal/*` skippt `next-intl` komplett (sonst 404 wegen Locale-Prefix-Mismatch in Routing).

### User-Feedback: native `confirm()` raus
- Release-Button im Portal nutzt jetzt shadcn-`Dialog` statt `window.confirm()`. Feedback-Memory `feedback_no_native_browser_confirm.md` projektübergreifend angelegt.
- grep durch SDK + Server: keine weiteren Vorkommen von `confirm(`/`alert(`/`prompt(`.

### User-Feedback: Display-Name für Aktivierungen
- SDK ergänzt automatisch `metadata.displayName`:
  - `node`: `<hostname> (PID <pid>)`
  - `browser`: `<domain>` + `userAgent` als Subtitle.
- Server-Side `enrichMetadataWithDisplayName` in `applyBindings` setzt Fallback für `domain` (= raw value) und `installation` (= „Installation <prefix>"). Für `device`/`account` kein Auto-Display (potentielles PII — Caller entscheidet).
- Portal-Detail-Page zeigt jetzt `Domain — Jans Laptop (Dev)` als Header + `node · userAgent` als Subtitle, Hash nur noch klein-grau.

### Bündel F — Verifikation
- 92 Tests grün (87 Server inkl. 2 neue Phase-6 = portal-session 3, auth-token 4 + 5 SDK).
- Browser-E2E mit Chrome DevTools:
  1. Admin legt Customer „Maria Tester Portal" an → Setup-Mail im pino-Log.
  2. `/portal/setup?token=…` → Passwort gesetzt (Test-Passwort lokal, nicht im LOGBUCH).
  3. `/portal/login` → Cookie + Dashboard. Anfangs leer (Maria neu).
  4. SQL: Phase-3-Lizenz `TR0P-Y1C7-…-CHS0` Maria zugeordnet → Lizenz erscheint im Portal.
  5. License-Detail mit 3 Aktivierungen sichtbar (1 active, 2 released).
  6. Klick „Freigeben" → erst native `confirm()` (Bug!) → Modal-Fix → erneuter Klick → Inline-Dialog → Confirm → released. AuditLog: `activation.released` mit `actorType=system, actorId=<customerId>, metadata.releasedBy=portal`.
  7. Neue Aktivierung via curl mit `displayName: "Jans Laptop (Dev)"` → Reload Portal → zeigt sprechenden Namen.

### Nächster Schritt
- Phase-6-Bundle committen + pushen.
- Roadmap-Lücke füllen: SMTP-Adapter wenn Jan mit dem mailcow-Account fertig ist. React-Bindings + KEK-Rotation-Skript bleiben Backlog.

---

## 2026-05-27 — Phase 5 Audit + Härtung komplett

### Bündel A — Audit-Log-Viewer
- `lib/services/audit-log-service.ts` mit `listAuditLogs(query)` (Zod-Schema mit eventType/actorType/actorId/targetType/targetId/from/until/limit/offset) + `getLatestAuditLogTimestamp()`.
- `app/api/admin/v1/audit-logs/route.ts` GET mit Scope `audit:read`.
- Admin-UI `/admin/audit-log` (Server Component): Tabelle mit Zeitpunkt/Event/Actor/Target/IP-Hash/Metadata, Filter-Form als Client-Component (`audit-log-filter.tsx`), Pagination als Client-Component (`audit-log-pagination.tsx`).
- Sidebar im Admin-Layout für Audit-Log aktiviert (war disabled).
- i18n-Strings unter `auditLog.*` in beiden Locales.

### Bündel B — Brute-Force-Protection
- `lib/auth/login-backoff.ts`: stateful per-Identifier, Skala 0s/0s/5s/15s/45s/120s/300s (cap), Index 1 = „erster Tippfehler = free probe". `recordSuccess` resettet den Counter.
- In `auth/config.ts` eingehängt: `check` direkt nach `loginLimiter.tryConsume`, `recordFailure` bei jedem der drei Fail-Pfade (unknown_email/bad_password/bad_totp), `recordSuccess` nach erfolgreichem TOTP.
- 5 Unit-Tests grün (free probe, increasing delay, cap, reset on success, isolation per identifier).

### Bündel C — Key-Rotation-UI
- `app/api/admin/v1/products/[id]/rotate-key/route.ts` POST mit Scope `products:write`, ruft `rotateSigningKey` aus dem Phase-3-Service.
- `_components/rotate-key-button.tsx` Dialog: Confirm mit Product-Name, Success-State zeigt neuen `kid`. Lesbare Error-Mappings.
- In Product-Edit-Page als Footer-Card mit Hinweis-Text + aktueller kid + Button eingebaut.

### Bündel D — Health-Check verfeinert
- `app/api/health/route.ts` umgebaut auf vier parallele Checks: `database` (Ping), `kek` (loadbar + 32 Byte), `signingKeys` (kein Product ohne aktiven Key), `auditLog` (latestEventAgoSeconds). 503 bei jedem Fehler.

### Bündel E — Backup-Konzept
- `docs/BACKUP.md` aufgenommen: was zu sichern ist (DB + KEK getrennt, NextAuth-Secret als Salt-Erhaltung), Beispiel-Skript für tägliches pg_dump mit Cron-Eintrag, Restore-Test-Procedure (Pflicht alle 90 Tage), KEK-Rotation-Skizze.

### Bündel F — Audit-Workflow
- `docs/AUDIT_WORKFLOW.md` aufgenommen: die drei Audits (Code / Workflow / Security), Sub-Agenten-Pattern, LOGBUCH-Format pro Audit-Lauf, Post-Deploy-Finding-Workflow.

### Bündel G — Verifikation
- typecheck/lint/test/build grün, **98 Tests** (85 Server inkl. 5 neuer Backoff-Tests + 13 SDK).
- Browser-E2E:
  - Audit-Log-Page rendert 16 Einträge mit aller Phase-2/3/4-History sauber, alle IPs gehasht.
  - Filter `eventType=license.created` → 2 Treffer (admin + api_key Phase-2-Run).
  - **Layout-Bug beim Filter** (User-Feedback): Buttons „Filter anwenden" + „Zurücksetzen" rutschten in `md:grid-cols-5` visuell aus der Card. Fix: Filter-Felder als 2-/4-Spalten-Grid, Buttons in eigener Footer-Zeile rechtsbündig mit Border-Top-Separator. Screenshots vor/nach in `docs/screenshots/phase5-audit-log-{before,after}-fix.png`.
- Rotate-Key-Flow per UI:
  - Dialog zeigt aktuelle kid + Confirm-Text mit Product-Name.
  - Nach Klick: Success-State mit neuer kid `cmpnzwpfo00028c3m94ryemet`.
  - DB-Check: alter Key `isActive=false` + rotatedAt gesetzt, neuer Key `isActive=true`, `Product.activeSigningKeyId` zeigt auf neuen.
  - Audit-Events `signing_key.created` + `signing_key.rotated` (beide admin) in DB.
- Enriched Health: alle 4 Checks `ok`, status `200`.

### Nächster Schritt
- Phase-5-Bundle committen + pushen.
- Auf Phase-6-Go warten (Self-Service-Portal für Endkunden — Kunden-Login, eigene Lizenz-Verwaltung, Aktivierungen einsehen/freigeben, React-Bindings im SDK).

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
