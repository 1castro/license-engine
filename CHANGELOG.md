# License Engine — Changelog

Alle nennenswerten Änderungen an diesem Projekt werden hier dokumentiert.

Format orientiert sich an [Keep a Changelog](https://keepachangelog.com/de/1.1.0/),
Versionierung nach [Semantic Versioning](https://semver.org/lang/de/).

---

## [1.7.1] - 2026-06-04 — Dashboard zeigt unbegrenzte Seats + stabile Reihenfolge

Kleine Verbesserung der Admin-Übersicht (nur Anzeige, kein API-/Schema-Change).

### Geändert
- Die Seat-Spalte der **Aktiv-Lizenzen-Übersicht** zeigt jetzt auch **unbegrenzte**
  Bindungstypen, die Aktivierungen haben (z.B. `account` ohne `maxPerType`) — als
  „Nutzer N/∞" mit Live-Count, statt sie wegzulassen. Vorher sah man bei Mandanten mit
  unbegrenzten Account-Seats (FidiBus/Shuttle) nur „Domain 1/1".
- **Stabile Reihenfolge** der Seat-Zeilen (Domain → Nutzer → Geräte → Installationen),
  unabhängig von der Reihenfolge in der `bindingPolicy`.
- Betrifft NUR die Dashboard-Übersicht (`getSeatUsageForLicenses`). Der API-Vertrag
  (`activate`/`recheck` `seats[]`) bleibt policy-reguliert (unverändert) — die
  Fahrdienst-Integration ist nicht betroffen.

---

## [1.7.0] - 2026-06-03 — Lizenz pausieren (suspend / reactivate)

Reversible Pause als erststufiger Lizenz-Status — getrennt vom terminalen `revoked`.
Erlaubt, eine Lizenz vorübergehend zu sperren (z. B. zur Klärung mit dem Kunden) und
später **nahtlos** wieder zu aktivieren, ohne neu anzulegen.

### Hinzugefügt
- **Neuer Status `suspended`** (Pause). **Pausieren** (`active → suspended`): App-Zugriff
  wird gesperrt, die belegten **Plätze bleiben aber gehalten** (NICHT freigegeben — anders
  als revoke/expire). **Reaktivieren** (`suspended → active`): die gehaltenen Plätze laufen
  nahtlos weiter, **keine Neu-Aktivierung** nötig.
- **App-Verhalten:** `activate` während Pause → **403 `license_suspended`**; `recheck` →
  **`{ status: 'suspended' }`** → SDK wirft `LicenseSuspendedError` und **behält den Cache**
  (reversibel). Übergänge sind streng geführt (nur active↔suspended).
- **Admin-UI:** Aktionen „Pausieren" + „Reaktivieren" (Inline-Modal, kein nativer Dialog) +
  Status-Badge „Pausiert". **Admin-API:** `POST /api/admin/v1/licenses/{id}/suspend`
  (Grund optional) + `.../reactivate` (Scope `licenses:write`).
- **Audit:** `license.suspended` + `license.reactivated` (als kritische/forensische Events
  klassifiziert, 365 Tage Retention).

### Schema
- `LicenseStatus += suspended`; `License += suspendedAt`, `suspendReason` — zwei additive
  Migrationen (Enum-Wert + 2 nullable Spalten), backward-kompatibel.

### Tests
- +6 Integration (Plätze-gehalten, 403 bei Pause, recheck `suspended`, nahtloses Reaktivieren,
  Transition-Guards) + 2 SDK-Unit (`LicenseSuspendedError`, Cache bleibt). Gesamt 177 Unit +
  55 Integration.

---

## [1.6.0] - 2026-06-03 — Anzeige-Metadaten im Token (licensee / plan / Lizenz-Ende)

Damit eine integrierte App „Licensed to …" und „Gültig bis …" **authentisch aus der
Lizenz** zeigen kann — statt aus lokaler Config. Rein darstellend, additiv,
backward-kompatibel, kein Schema-Change. Kein Verwaltungs-Panel in der App.

### Hinzugefügt
- **`licensee`** (= `company ?? name` des Kunden): authentisches „Licensed to …".
- **`plan`** (= `planName` der Lizenz, sofern gesetzt): Plan-Anzeige.
- **`licenseExpiresAt`** (echtes Lizenz-Ende, ISO) + **`perpetual`** (`true` bei
  unbefristet): App zeigt „Gültig bis <Datum>" bzw. „unbegrenzt" — **getrennt vom
  Token-`exp`**, das nur die Offline-Grace-Grenze (~7 Tage) ist.
- Alle vier Felder landen sowohl **im signierten JWT** (offline lesbar) als auch
  **in der activate/recheck-Antwort** (REST-Bequemlichkeit). Beim recheck neu
  ausgestellt → eine Kunden-Umbenennung/Verlängerung wirkt zum nächsten Recheck.
- **SDK:** `ValidatedLicense` exponiert `licensee`/`plan`/`licenseExpiresAt`/`perpetual`
  (defensiv typgeprüft, wie `features`).

### Hinweise
- **Optional/additiv:** ältere Tokens ohne die Claims funktionieren unverändert;
  die Felder werden nur gesetzt, wenn vorhanden (kein leeres `plan`, kein
  `licenseExpiresAt` bei perpetual).
- **Datenminimiert:** nur Name/Plan/Lizenz-Ende — bewusst KEINE E-Mail/sonstige PII.
  Konsistent mit der bereits erlaubten Anzeige-Metadaten-Linie (`planName`/`priceDisplay`).
  Der Name liegt im signierten (nicht verschlüsselten) Token — vertretbar, da es der
  eigene Name des Lizenznehmers ist und reine Anzeige.

---

## [1.5.1] - 2026-06-02 — X-Forwarded-For Anti-Spoofing (Per-IP-Rate-Limits)

Nachgelagerter Sicherheits-Fix nach Verifikation der Reverse-Proxy-Konfiguration
(Befund aus dem v1.5.0-Härtungs-Audit, jetzt abschließend geschlossen).

### Sicherheit
- **`extractIp` nicht mehr per `X-Forwarded-For` spoofbar.** Der NGINX Proxy Manager
  hängt die echte Peer-IP **hinten** an einen ggf. client-gesendeten `X-Forwarded-For`
  an (`$proxy_add_x_forwarded_for`) — der bisher genutzte **erste** Eintrag war damit
  angreifer-kontrolliert, sodass alle Per-IP-Rate-Limits (activate/recheck/deactivate,
  Login-IP, discovery, forgot-IP) durch einen rotierenden XFF-Header umgehbar waren.
  `extractIp` bevorzugt jetzt **`X-Real-IP`** (vom Proxy mit `$remote_addr` überschrieben →
  nicht spoofbar) und fällt nur auf den **letzten** XFF-Eintrag zurück. Per-Email-Limit,
  progressiver Backoff und die harte Map-Obergrenze waren bereits unabhängig wirksam.

---

## [1.5.0] - 2026-06-02 — Voll-Audit-Härtung vor erster Lizenzierung

Kompletter Workflow-Audit über die gesamte Engine (Code/Logik/Security, Recall-Modus)
**vor der ersten echten Lizenzierung**. 24 von 25 Findings behoben (1 Blocker, 8 Major,
15 Minor); #15 bewusst zurückgestellt. In drei verifizierten Batches umgesetzt, dann
gebündelt.

### Behoben (Korrektheit)
- **Blocker — Verlängerung einer abgelaufenen Lizenz war wirkungslos** (#1): `updateLicense`
  setzt eine `expired`-Lizenz bei Verlängerung (Zukunfts-`expiresAt` oder perpetual) wieder
  auf `active`. Vorher blieb der zahlende Kunde nach Renew dauerhaft gesperrt (activate/recheck
  prüfen `status` vor `expiresAt`). Nur expired→active, niemals revoked.
- **Lazy-Expire gab Seats nicht frei** (N1): neue zentrale `expireLicense()` released aktive
  Activations in einer Transaktion (analog `revokeLicense`), idempotent + Audit; genutzt von
  activate, recheck und dem Expire-Cron. Vorher zählten abgelaufene Lizenzen ihre Plätze
  dauerhaft als belegt → spätere Reaktivierung lief gegen das Quota-Limit.
- **Uhren-Skew verwarf frische Tokens** (N6): `clockTolerance` (30s) in Server- **und**
  SDK-Verifier. Ein Client mit leicht nachgehender Uhr lehnte sein gerade erhaltenes,
  gültig signiertes JWT nicht mehr ab.
- **deactivate ohne Binding-Ownership-Prüfung** (#10/N5): deactivate gibt nur noch Bindings
  frei, die das vorgelegte Token tatsächlich trägt (Abgleich gegen `claims.bindings` über
  dieselbe `hashBindingValue`-Funktion). Vorher konnte jeder gültige Token einer Lizenz einen
  fremden Seat derselben Lizenz freigeben.

### Geändert
- **Produkt-Slug ist nach Erstellung immutable** (N4): der Slug ist die JWT-Audience + Teil
  der SDK-Konfiguration jeder integrierten App; eine Änderung hätte alle ausgestellten Tokens
  schlagartig invalidiert. Aus dem Update-Schema entfernt, im Produkt-Formular im Edit-Modus
  gesperrt (mit Hinweis), nur beim Anlegen setzbar.
- **SDK-Fehlerklassifikation** (#2/#8/N7): 5xx und 429 beim recheck werden wie Server-
  Unerreichbarkeit behandelt → `ServerUnreachableError` mit Grace (der Cache-Token bleibt im
  exp-Fenster gültig) statt harter Aussperrung bei einem transienten Hiccup;
  `unknown_product`/`validation_error`/`invalid_json` → neue `LicenseConfigError`
  (Integrations-/Konfig-Fehler, kein Lizenz-Verdikt); nbf/iat-Claim-Fehler → eigener Code
  `not_yet_valid` statt irreführend `signature_invalid`.
- **SDK-Selbstheilung** (#9/N8): `performRecheck` verwirft den lokalen Cache bei hart
  abweisbaren `token_*`-Fehlern (z.B. nach Key-Rotation); ein korruptes `lastRecheckAt` (NaN)
  erzwingt einen Recheck, statt ihn stumm dauerhaft zu unterdrücken.
- **Dashboard-Performance** (#11): Seat-Auslastung der Aktiv-Lizenz-Übersicht über **einen**
  `groupBy` statt einer COUNT-Query pro Lizenz/Bindungstyp (~100 → 1 bei 50 Lizenzen).
- **`features`-Claim defensiv** (N9): das SDK coerct `claims.features` zu `string[]` — ein
  Token ohne/mit fehlerhaftem Claim liefert `[]` statt die integrierende App bei `.includes()`
  abstürzen zu lassen.

### Sicherheit
- **Reset-Mail-Schranke IP-unabhängig** (#3): das Pro-E-Mail-Limit (Mail-Bomb-Schutz) greift
  jetzt unabhängig von der Quell-IP; zusätzlich ein separates, großzügigeres Pro-IP-Limit.
  Vorher ließ sich die Schranke per IP-Rotation aushebeln (Postfach-Flutung).
- **Portal-Login Pro-IP-Gate** (N2): zusätzlich zum Pro-E-Mail-Limit, gegen verteiltes
  Credential-Spraying über viele Adressen.
- **Rate-Limiter-/Backoff-Speicher begrenzt** (N10): Eviction voll-aufgefüllter Idle-Buckets
  gegen unbegrenztes Map-Wachstum (gespoofte `X-Forwarded-For` → OOM).
- **public-keys-Endpoint** (#12): Rate-Limit + einheitliche JSON-500-Hülle, konsistent zu
  activate/recheck/deactivate.
- **Portal-Routen 500-Hülle** (#13): Top-Level try/catch um login/forgot-password/setup/reset
  → einheitlicher JSON-Fehler statt rohem Next.js-HTML im Infra-Fehlerfall.
- **Portal-Session-Footgun entschärft** (#14): `verifyPortalSession` → `verifyPortalSessionSignature`
  umbenannt (reine Krypto, kein State-Anker); `getPortalSession` bleibt der einzige Einstieg
  mit `portalSessionsValidAfter`- + Customer-Existenz-Prüfung.
- **E-Mail-Wechsel-Hygiene** (N3): das Ändern der Kunden-E-Mail setzt `emailVerifiedAt` zurück
  und invalidiert bestehende Portal-Sessions (analog Passwort-Reset).
- **node:os-ESM-Fix** (#4): Hostname-Erfassung im Node-SDK über statischen `import` — vorher
  `require('node:os')` → im ESM-Build immer „unknown-host".

### Tests
- **Test-Netz erweitert** (#5/#6/#7): +23 Integrationstests (recheck-Lifecycle inkl.
  Un-Expire + Seat-Release, deactivate inkl. Ownership + Quota-Concurrency, `authenticateApiKey`,
  `getPortalSession`-State-Anker, public-keys), +13 Unit/SDK-Tests (SDK-Grace-Statemachine,
  clockTolerance/nbf, Rate-Limit-Eviction, Produkt-Slug-Schema). Gesamt **168 Unit + 44
  Integration**, alle grün.

### Offen
- **#15** (E-Mail-basierte idempotente Verknüpfung eines bestehenden Kunden mit einer PSP-
  `externalRef`): zurückgestellt bis zum Bau des Sync-Moduls. Blast-Radius heute null (kein
  PSP-Sync aktiv); als Hinweis in [INTEGRATION.md](./docs/INTEGRATION.md) dokumentiert.

---

## [1.4.0] - 2026-05-29 — Payment-Vorbereitung (PSP-agnostisch)

Engine-Basis für die spätere Anbindung eines Zahlungsdienstleisters (Merchant of
Record), ohne die PSP-Wahl festzulegen (Polar/Paddle beide bedienbar). **Keine
Payment-Logik** — Abrechnung/Steuer bleiben beim PSP.

### Hinzugefügt
- **Display-Abrechnungs-Metadaten** an der Lizenz (`planName`, `priceDisplay`,
  `billingInterval`): reine Anzeige, vom PSP/Sync-Modul gespiegelt. Eingebbar im
  Lizenz-Formular, sichtbar in der Admin-Lizenzansicht und im Kundenportal
  („Plan" / „Preis").
- **`polar`** als neue Zahlungsquelle (`ExternalSource`), durchgängig in Admin-
  und Kunden-Formular + Listen-Labels.
- **Lizenz-Lookup per `externalRef`/`externalSource`** (`GET /api/admin/v1/licenses`
  + Service-Filter): ein künftiges Webhook-Sync-Modul findet eine Lizenz über
  `(Quelle, Referenz)` und verlängert sie idempotent per PATCH.

### Geändert
- CLAUDE.md-Payment-Abgrenzung aufgeweicht: Payment-**Logik** bleibt draußen,
  gespiegelte **Anzeige-Metadaten** sind erlaubt.

---

## [1.3.0] - 2026-05-29 — Fehlversuch-Protokoll, Integrationstests, Log-Retention

Härtungs-Block vor der ersten echten App-Integration. Jeder Teil mit Pre-Deploy-Audit
(3-Agenten-Workflow + adversariale Verifikation) und Fix-Runde.

### Hinzugefügt
- **Fehlversuch-Protokoll**: Abgewiesene Aktivierungen werden als Audit-Event
  `activation.rejected` an allen fachlichen Ablehnungspfaden erfasst (ungültiger Key,
  unbekannte/inaktive/abgelaufene Lizenz, Platz-Limit, fehlende Pflichtbindung) und
  sichtbar gemacht: **License-Manager-Dashboard** (vorher leer → Kennzahlen + aktive
  Lizenzen mit Plätzen + Fehlversuch-Zähler + wegklickbares Warn-Banner),
  **Lizenz-Detailseite** (Detail-Tabelle mit Klartext-Gründen), **Kundenportal**
  (schlichter Hinweis, nur Anzahl).
- **Integrationstest-Infrastruktur**: echte API-Route-Handler gegen echtes Postgres
  (`pnpm test:integration`, Wegwerf-DB via `docker-compose.test.yml`). 16 Tests sichern
  Seat-Limit, Quota-beim-Reaktivieren, Reject-Audit, revoked/expired-Lizenz,
  Multi-Tenant-Isolation und die Privilege-Escalation-Sperre ab.
- **Audit-Log-Retention**: differenziertes Pruning (`pnpm audit:prune`, per Cron) —
  Sicherheits-/Forensik-Events 365 Tage, Routine 90 Tage (ENV `AUDIT_RETENTION_*`).
  Harte Invariante `critical >= routine` (fail-fast), fail-safe Allowlist (unbekannte
  Events werden nie gelöscht).
- **shared-types**: Over-the-wire-Typen einmalig in `@license-engine/shared-types`,
  von Server + SDK genutzt; activate/recheck-Antworten per `satisfies` gegen den Vertrag geprüft.

### Geändert
- „Zuletzt aktiv" wird auch beim `recheck` aktualisiert.
- Dokumentation konsolidiert: schlanke Struktur (Briefing + Changelog im Root, alles
  Weitere in `docs/`: PROJEKT, LOGBUCH, INTEGRATION, BETRIEB).

---

## [1.2.0] - 2026-05-28 — Portal-Self-Service & Seat-Verwaltbarkeit

Aufbauend auf dem Seat-Management (1.1.0): die Verwaltung wird **laientauglich**
und läuft zentral über das Kunden-Portal — integrierte Apps brauchen kein eigenes
Lizenz-Panel. Das Integrations-Modell ist bewusst **universell** gehalten (für
beliebige künftige Apps), der Fahrdienst ist nur das erste Beispiel.

### Hinzugefügt
- **Seat-Editor im Lizenz-Formular**: bindingPolicy wird pro Typ über
  „erforderlich"-Häkchen + „max. Plätze"-Feld gepflegt (statt rohem JSON), mit
  strikter serverseitiger Validierung.
- **Aktivierungs-Ansicht** (Admin + Portal): nach Bindungstyp gruppiert, mit
  prominentem Anzeigenamen, **Kürzel** als eigener Spalte (Member-ID o.ä.), Suche
  und Paginierung pro Typ.
- **Portal-Self-Service** für Kunden: Umschalten zwischen Bindungstypen über
  **Tabs**, „Plätze"-Übersicht (belegt/max) oben in der Lizenz-Karte, Firmenname
  im Header, Hinweis zum sorgsamen Umgang mit der Lizenznummer.
- **Setup-Mail erneut senden** (für Kunden-Admins) aus dem Admin-UI.

### Geändert
- **„Zuletzt aktiv" (`lastSeenAt`) wird auch beim `recheck` aktualisiert** — die
  Spalte spiegelt jetzt laufende Nutzung wider, nicht nur den letzten `activate`
  (Granularität = Re-Check-Intervall). Kein zusätzliches Audit-Logging.
- **Integrations-Leitfaden** (`docs/INTEGRATION.md`) auf das universelle Modell
  geschärft: aktivitätsbasierte Seat-Belegung (Per-Request, nicht login-gebunden),
  server-seitiger Token-Cache pro Binding, fail-closed bei Erst-Aktivierung,
  metadata-Konvention (`value`=Anker, `displayName`, `identifier`).

### Sicherheit
- Die **Domain-Bindung** (feste App-Lizenz-Identität) kann im Portal nur angesehen,
  **nicht** freigegeben werden — serverseitig erzwungen (403), nicht nur UI-seitig.
- Layout-DB-Abfrage für den Header gegen DB-Ausfälle abgesichert (fail-safe).

---

## [1.1.0] - 2026-05-28 — Seat-Management für App-Lizenzierung

Grundlage, damit integrierte Apps ein Platz-Limit (Seats) nutzen, anzeigen und
verwalten können — erster Anwendungsfall: der Fahrdienst (Lizenz pro Mandant,
Plätze pro Fahrer-Account). Konzept: `docs/INTEGRATION.md`.

### Hinzugefügt
- **Seat-Auslastung in den API-Antworten**: `activate` und `recheck` liefern ein
  `seats`-Array (`{ type, used, max }` je Binding-Typ), damit eine App
  „37 von 100 Plätzen belegt" anzeigen kann.
- **Aktivierungs-Verwaltung im Admin-UI**: pro Lizenz unter „Aktivierungen" die
  belegten Plätze + Auslastung sehen und einzeln freigeben.
- **Service-API für Seat-Management**: `GET /api/admin/v1/licenses/{id}/activations`
  (auflisten) + `POST .../{activationId}/release` (freigeben), per API-Key mit den
  neuen Scopes `activations:read` / `activations:write`.
- **API-Key-Lizenz-Bindung**: Ein API-Key kann optional an eine einzelne Lizenz
  gebunden werden — er sieht und verwaltet dann nur deren Plätze (Mandanten-
  Isolation). Im API-Key-Dialog konfigurierbar.

### Sicherheit
- Lizenz-gebundener API-Key, der eine fremde Lizenz anfragt, erhält 404
  (Existenz wird nicht preisgegeben). Read/Write-Scopes getrennt.

---

## [1.0.0] - 2026-05-28 — Erste Production-Release (live auf license.tropicsoft.de)

Erste Live-Schaltung nach zwei Pre-Deploy-Audit-Runden (Code-, Workflow-,
Security-Audit). Deployment als eigener Docker-Stack auf dem Haupt-Server,
Zugriff ausschließlich über den NGX Proxy Manager.

### Sicherheit (Audit-Härtung)
- License-Key-Prüfsumme auf den **Damm-Algorithmus** umgestellt (Server + SDK) —
  erkennt garantiert alle Einzelzeichen-Fehler und Nachbar-Vertauschungen.
- **TOTP-Replay-Schutz** als atomares Compare-and-Set (kein Token zweimal gültig).
- **Portal-Auth-Tokens** werden atomar eingelöst (keine doppelte Verwendung).
- `Customer.email` mit UNIQUE-Constraint + Normalisierung (trim/lowercase) an
  allen Lese-/Schreibstellen.
- **Aktivierungen** laufen in einer Transaktion mit Zeilen-Sperre auf der Lizenz;
  Status wird innerhalb der Sperre erneut geprüft (kein Token für widerrufene Lizenz).
- Re-Check filtert freigegebene (released) Bindungen heraus und whitelistet den
  Bindungstyp gegen das Schema.
- **Security-Header** projektweit: HSTS, CSP, X-Frame-Options DENY,
  X-Content-Type-Options, Referrer-Policy, Permissions-Policy.
- `TRUST_PROXY_HEADERS`-Schalter (Default aus): Proxy-Header nur hinter dem
  Reverse-Proxy vertrauen → kein IP-Spoofing der Rate-Limit-/Audit-Hashes.
- **Health-Endpoint** (`/api/health`) von außen abgeschirmt — extern 404,
  intern (Docker-Healthcheck, Monitoring) weiter erreichbar.
- Portal-Session-Cookie auf `SameSite=Strict`; Portal-Login loggt nur den
  IP-Hash (DSGVO).
- pino-Redact-Liste erweitert (Passwörter, Secrets, Tokens, Private Keys).

### Hinzugefügt
- **SMTP-Mailversand** (`SmtpMailSender`, nodemailer, mailcow-tauglich) mit
  automatischem Fallback auf Console-Ausgabe, wenn nicht konfiguriert.
- **Lizenz-Ablauf**: Lazy-Expire beim Lesen (activate/recheck) + Bulk-Cron-Skript
  `pnpm licenses:expire`, jeweils mit `LicenseExpired`-Audit-Eintrag.
- Re-Check-Antwort liefert `recheckIntervalHours`; das SDK speichert den Wert.
- **Favicon** (Schlüssel-Symbol) für die Web-Oberfläche.
- **Changelog-Ansicht** in der Admin-Oberfläche (Link in der Seitenleiste,
  Modal mit diesem Dokument).

### Deployment
- Docker-Stack auf `188.245.95.60`: zwei Container (App + eigener PostgreSQL 16)
  in einem Compose-Stack, internes Netz für die DB, kein Host-Port.
- Erreichbar über NGX Proxy Manager unter `license.tropicsoft.de`.
- Multi-Stage-Build (Next.js standalone, Node 22, Alpine), Migrations als
  Einmal-Job im `migrate`-Profile, `pull_policy: never` + Watchtower-Ausschluss
  für saubere Dockge-Verwaltung.

---

## [0.6.0] - 2026-05-27 — Self-Service-Portal (Phase 6)

### Hinzugefügt
- Kunden-Portal unter `/portal/*` mit eigenem Login (getrennter JWT-Cookie
  `le_portal_session`, HttpOnly), Passwort-Setup und -Reset über Single-Use-Tokens
  (nur Hashes in der DB, TTL pro Zweck).
- Portal-Dashboard: Lizenz-Übersicht + Lizenz-Detail mit Freigabe von Aktivierungen.
- Setup-Mail wird beim Anlegen eines Kunden automatisch versendet.
- Mail-Abstraktion (`MailSender`) mit Console-Implementierung.

### Geändert
- Aktivierungen zeigen einen sprechenden Anzeigenamen (Domain / Installation),
  Hash nur noch als Beleg.
- Alle Bestätigungen als Inline-Modal statt nativer Browser-Dialoge.

---

## [0.5.0] - 2026-05-27 — Audit & Härtung (Phase 5)

### Hinzugefügt
- Audit-Log-Viewer in der Admin-UI mit Filtern und Pagination.
- Brute-Force-Schutz mit progressivem Backoff beim Admin-Login.
- Signing-Key-Rotation über die Produkt-Verwaltung.
- Health-Check mit Datenbank-, KEK-, Signing-Key- und Audit-Log-Prüfung.
- Backup- und Audit-Workflow-Dokumentation.

---

## [0.4.0] - 2026-05-27 — JS/TS-SDK (Phase 4)

### Hinzugefügt
- `@tropicsoft/license-sdk-js`: framework-agnostischer Core mit Aktivierung,
  Token-Cache, Re-Check, Offline-Verifikation gegen den Public Key.
- Storage-Adapter (Browser: IndexedDB, Node: Dateisystem, In-Memory für Tests).
- Klare Fehlerklassen (Expired / Revoked / BindingMismatch / ServerUnreachable
  mit Grace-Period-Info).

---

## [0.3.0] - 2026-05-27 — Token-Engine (Phase 3)

### Hinzugefügt
- Ed25519-JWT-Ausstellung mit Algorithmus-Pinning und Key-Rotation-Support.
- Öffentliche API: `/api/v1/activate`, `/recheck`, `/deactivate`,
  `/.well-known/public-keys`.
- KEK-Envelope-Verschlüsselung der privaten Signing-Keys (AES-256-GCM),
  KeyProvider-Abstraktion (Env/File).
- Rate-Limiting auf allen öffentlichen Endpunkten.

---

## [0.2.0] - 2026-05-27 — Datenmodell & Admin-CRUD (Phase 2)

### Hinzugefügt
- Prisma-Datenmodell: Product, SigningKey, Customer, License, Activation,
  AuditLog, AdminUser, ApiKey.
- Admin-UI für Produkte, Kunden und Lizenzen (Anlegen, Bearbeiten, Widerrufen).
- License-Key-Generierung (`TROP-XXXX-XXXX-XXXX-XXXX`), idempotente
  Lizenz-/Kunden-Erstellung über `externalRef`.
- API-Key-Authentifizierung mit Scopes für Service-zu-Service-Zugriff.

---

## [0.1.0] - 2026-05-27 — Foundation (Phase 1)

### Hinzugefügt
- Monorepo (pnpm Workspaces): `apps/server`, `packages/sdk-js`,
  `packages/shared-types`.
- Next.js 14 (App Router) + TypeScript strict, TailwindCSS + shadcn/ui.
- NextAuth Credentials-Login mit TOTP-2FA und Replay-Schutz.
- PostgreSQL + Prisma, Multi-Stage-Dockerfile, `docker-compose.yml`.
- next-intl (Deutsch/Englisch), pino-Logging, Vitest-Setup.
