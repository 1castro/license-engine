# ARCHITEKTUR — License Engine

> Ausgelagert aus CLAUDE.md am 10.07.2026. Verbindliche Architektur-Entscheidungen, Datenmodell und API-Skizze aus dem ursprünglichen Projektbriefing.

## Vision

Zentraler, selbst gehosteter Multi-Product-Lizenz-Server, der signierte Tokens an Clients ausstellt und über SDK + REST-API in beliebige eigene Projekte (Web-Apps, Websites, später iOS/Android) integriert werden kann. Ziel: alle Lizenzierungs-Workflows einer Solo-Developer-Produktlandschaft an einer Stelle bündeln, sauber administrierbar, langfristig erweiterbar.

## Payment/Billing-Abgrenzung

Payment- und Billing-Funktionalität ist **explizit kein Teil dieser License Engine** und wird nicht in diesem Projekt implementiert. Sie wird später als separates, eigenständiges Modul angebunden — voraussichtlich über eine externe Plattform (Stripe oder Paddle) plus dünnes Sync-Modul, das per Webhook Lizenzen erzeugt, verlängert und widerruft.

Folgende Punkte sind beim Design der License Engine zwingend zu berücksichtigen, damit die spätere Anbindung ohne strukturelle Umbauten möglich ist:

- **Lizenz-Lebenszyklus als saubere, von außen ansteuerbare API.** Lizenzen erzeugen, verlängern, widerrufen, Feature-Flags ändern muss programmatisch über die REST-API möglich sein — nicht nur über das Admin-UI. Diese Endpoints werden später vom Sync-Modul aufgerufen.
- **External-Reference-Felder im Datenmodell vorsehen.** `Customer` und `License` bekommen je ein nullable `externalRef` (String, indiziert) und `externalSource` (z.B. `"stripe"`, `"paddle"`, `"manual"`). Damit lässt sich später eine externe Subscription eindeutig zuordnen, ohne dass das Datenmodell migriert werden muss.
- **Lizenz-Erstellung idempotent.** Mehrfache Aufrufe mit derselben `externalRef` dürfen nicht zu doppelten Lizenzen führen — Webhooks von Zahlungsanbietern treffen aus Netzgründen mehrfach ein.
- **Subscription-Ablauf entkoppelt von Zahlung.** Die License Engine prüft nur `expiresAt` und Status der Lizenz. *Warum* eine Lizenz abläuft oder verlängert wurde (Zahlung, Kündigung, Trial-Ende), ist nicht ihre Sache — das entscheidet später das Sync-Modul und ruft die entsprechenden License-Engine-Endpoints auf.
- **API-Authentifizierung für Service-zu-Service vorsehen.** Neben dem User-Auth fürs Admin-UI braucht es eine Möglichkeit, dass ein externes System (Sync-Modul) sich gegen die Admin-API authentifiziert. API-Keys mit Scopes sind ausreichend, kein vollwertiges OAuth nötig. Im aktuellen Scope nur als Konzept im Datenmodell und Auth-Middleware vorbereiten, nur ausimplementieren wenn für Phase 1 nötig.
- **Keine Payment-Logik im System.** Abrechnung, Zahlungsabwicklung, Steuer-/USt-/Rechnungs-Logik bleiben komplett draußen — das ist Sache des PSP (Merchant of Record) bzw. des späteren Sync-Moduls. **Erlaubt sind dagegen reine Anzeige-Metadaten an der Lizenz** (`planName`, `priceDisplay`, `billingInterval`): vom PSP gespiegelte Strings, damit Admin/Kunde sehen, was eine Lizenz ist/kostet. Keine Beträge als Zahl, keine Berechnung, keine Steuer — nur Anzeige; die Wahrheit über Preise lebt beim PSP. (Aufgeweicht 2026-05-29 ggü. der ursprünglichen „auch nicht als optionales Feld"-Regel; PSP-Evaluierung empfahl MoR-Modell, Polar/Paddle, Endwahl offen.) **Ebenfalls erlaubt (ab v1.6.0):** der Server spiegelt in den signierten Token + die activate/recheck-Antwort reine **Anzeige-Felder** für die App — `licensee` (= `company ?? name`), `plan`, `licenseExpiresAt` (echtes Lizenz-Ende) und `perpetual` —, damit eine App „Licensed to …" / „Gültig bis …" authentisch aus der Lizenz zeigt. Datenminimiert (Name/Plan/Ende; KEINE E-Mail/sonstige PII), rein darstellend, kein Verwaltungs-Panel in der App.

## Architektur-Entscheidungen (fix)

### Server
- Zentraler Multi-Product-Service. EIN Server verwaltet Lizenzen für alle Produkte.
- Hybrid-Validierung: Client aktiviert online → erhält signiertes JWT → validiert danach offline → periodischer Re-Check beim Server.
- Token-Format: JWT mit Ed25519-Signatur. Public Key wird mit dem SDK verteilt, Private Key bleibt serverseitig. Key-Rotation muss vorgesehen sein.
- Re-Check-Intervall: Default 12h, konfigurierbar pro Produkt.
- **JWT-Lifetime + Grace Period:** Default `exp = 48h`, Re-Check alle 12h, Grace = `exp`. Bei Server-Unerreichbarkeit darf der Client bis zum Ablauf von `exp` weiter validieren, danach harter Validation-Failure. Kurze Defaults, damit ein Widerruf/Ablauf schnell greift (online ≤12h, Offline-Grace ≤48h); `exp` und `recheckIntervalHours` pro Produkt konfigurierbar (z.B. länger für offline-tolerante Desktop-Apps). Refresh-Token-Modell bleibt optional als `revocationStrategy = refresh` für Produkte mit Bedarf nach noch schnellerem Widerruf (Schema vorhanden, noch nicht implementiert).

### License-Key-Format
- Endkunden-sichtbarer Lizenzschlüssel: `TROP-XXXX-XXXX-XXXX-XXXX` (4 Gruppen á 4 Zeichen, alphanumerisch, eine Position pro Gruppe als CRC-/Damm-Checksum-Char).
- Format ist Tipp-fehler-robust und sieht erkennbar nach Lizenzschlüssel aus.
- Generierung serverseitig bei Lizenz-Erstellung. UUID-Primary-Key bleibt intern, der License-Key ist separat als indiziertes Feld `License.licenseKey` (UNIQUE).
- Pro Produkt konfigurierbares Prefix möglich, Default-Prefix `TROP-`.

### Master-Encryption-Key (KEK)
- KEK verschlüsselt die in der DB gespeicherten Ed25519-Private-Keys (`SigningKey.privateKeyEncrypted`).
- Bereitstellung: ENV-Variable `ENCRYPTION_KEY` (Base64) ODER File-Path `ENCRYPTION_KEY_FILE`. **File hat Vorrang vor ENV**, wenn beides gesetzt ist.
- Architektur-Vorbereitung: dünnes `KeyProvider`-Interface, das später durch einen KMS-Adapter (HashiCorp Vault, AWS KMS o.ä.) ersetzt werden kann, ohne dass aufrufender Code geändert werden muss. Tag-1-Implementierung: `EnvKeyProvider` + `FileKeyProvider`.

### Lizenzmodelle (kombinierbar pro Lizenz)
- Zeitbasiert (Subscription mit `expiresAt`)
- Feature-Flags (welche Features einer Lizenz aktiv sind, gegen den Feature-Katalog des Produkts)
- Perpetual (`expiresAt = null`)

### Bindungsmodelle (pro Lizenz konfigurierbar, einzeln oder kombiniert)
- Domain (Web-Apps / Websites)
- Geräte-Fingerprint (installierte Apps)
- Benutzer-Account (Login-basiert)
- Installation-ID (pro Installation/Instanz)

Eine `BindingPolicy` pro Lizenz definiert: welche Bindungstypen sind Pflicht, wie viele Aktivierungen pro Typ erlaubt sind, UND/ODER-Verknüpfung mehrerer Bindungen.

### Integration
- JS/TS-SDK als Erst-Implementierung (deckt Web-Apps, Next.js-Backends, Node-Tools ab).
- Dokumentierte REST-API als universeller Fallback; das SDK nutzt sie selbst.
- iOS- und Android-SDK kommen später. Architektur muss das ohne API-Brüche zulassen.

### Lizenzausstellung
- Admin-Web-UI von Tag 1 (manuelles Anlegen von Produkten, Kunden, Lizenzen).
- Self-Service-Portal für Kunden als spätere Ausbaustufe.

### Admin-Authentifizierung
- Heute: nur Owner (Jan), Passwort + TOTP-2FA.
- Datenbankschema ab Tag 1 rollen-fähig (Owner / Operator / ReadOnly), im UI aber vorerst nicht exponiert.

### Service-zu-Service-Auth (Admin-API)
- Für externe Systeme (späteres Payment-Sync-Modul) gibt es einen zweiten Auth-Pfad: API-Keys mit Scopes.
- Tag-1: Datenmodell (`ApiKey`) + Auth-Middleware-Hook vorbereitet; UI-Verwaltung erst implementieren, wenn ein konkreter Konsument existiert.
- API-Keys werden im Klartext nur einmal bei der Erstellung angezeigt, in der DB liegen nur Hashes.
- Scopes folgen dem Schema `<resource>:<action>` (z.B. `licenses:write`, `licenses:revoke`, `customers:write`).

### Widerruf
- Pro Produkt konfigurierbar via `revocationStrategy`.
- Default: greift beim nächsten Re-Check (12h-Granularität).
- Erweiterbar auf Refresh-Token-Strategie pro Produkt, falls schnellerer Widerruf gewünscht.

### Audit-Logging
- Sicherheitsrelevante Events: Aktivierung, Widerruf, fehlgeschlagene Token-Validierung, Admin-Login, Lizenz-Erstellung/-Änderung, Key-Rotation.
- Keine flächendeckende Telemetrie pro Re-Check.
- IPs ausschließlich gehasht speichern. DSGVO-bewusst.

## Tech-Stack
- Next.js 14 (App Router) + TypeScript (strict mode)
- Prisma ORM mit PostgreSQL 16
- NextAuth (Credentials Provider) + TOTP via `otplib`
- `jose` für JWT-Signing/-Verification (Ed25519)
- TailwindCSS + shadcn/ui für Admin-UI
- `next-intl` ab Tag 1, Default-Locale Deutsch, Englisch als technisch eingerichteter Fallback (EN-Strings initial leer / Spiegel von DE)
- `pino` für strukturiertes JSON-Logging (operatives Server-Log, getrennt vom Audit-Log in der DB), `pino-pretty` für Dev
- Vitest für Tests (Fokus: sicherheitskritische Pfade)
- pnpm als Package Manager
- Monorepo (pnpm Workspaces): `apps/server`, `packages/sdk-js`, `packages/shared-types`

## Datenmodell (initialer Entwurf, im Verlauf zu verfeinern)
- `Product`: id, slug, name, featureCatalog (JSON), revocationStrategy, signingKeyId, recheckIntervalHours (default 12), jwtLifetimeHours (default 48), licenseKeyPrefix (default `TROP`)
- `SigningKey`: id, productId (nullable für globalen Default-Key), publicKey, privateKeyEncrypted, algorithm (`Ed25519`), createdAt, rotatedAt, isActive
- `Customer`: id, email, name, company (nullable), notes, externalRef (nullable, indiziert), externalSource (nullable, z.B. `stripe`|`paddle`|`manual`), createdAt
- `License`: id, customerId, productId, licenseKey (UNIQUE, Format `TROP-XXXX-XXXX-XXXX-XXXX` mit Checksum), type (`subscription`|`perpetual`), expiresAt (nullable), featureFlags (JSON), bindingPolicy (JSON), status (`active`|`revoked`|`expired`|`suspended`), revokedAt, revocationReason, suspendedAt, suspendReason, externalRef (nullable, indiziert), externalSource (nullable), createdAt
  - **`suspended` (Pause, ab v1.7.0):** reversible Deaktivierung, getrennt vom terminalen `revoked`. App-Zugriff gesperrt, aber **Plätze gehalten** (nicht freigegeben) → Reaktivieren (`suspended → active`) läuft nahtlos weiter. Nur `active↔suspended`. activate → `403 license_suspended`; recheck → `{status:'suspended'}`.
- `Activation`: id, licenseId, bindingType, bindingValueHash, bindingValueMetadata (JSON, nicht-sensitiv), activatedAt, lastSeenAt, status
- `AuditLog`: id, timestamp, eventType, actorType (`admin`|`api_key`|`system`|`anonymous`), actorId, targetType, targetId, metadata (JSON), ipHash
- `AdminUser`: id, email, passwordHash, totpSecret, role (`owner`|`operator`|`readonly`), createdAt, lastLoginAt
- `ApiKey`: id, name, keyHash, scopes (JSON, z.B. `["licenses:write","licenses:revoke"]`), createdAt, lastUsedAt, revokedAt (nullable) — für Service-zu-Service-Auth (späterer Sync-Modul-Zugriff). Tag-1: Schema + Auth-Middleware vorhanden, UI-Verwaltung erst wenn konkret benötigt.

**Idempotenz-Hinweis:** Lizenz-Erstellungs-Endpoint muss `externalRef` + `externalSource` als Idempotenz-Schlüssel akzeptieren. Mehrfache Aufrufe mit derselben Kombination liefern die existierende Lizenz, statt eine neue zu erzeugen.

## API-Oberfläche (Skizze)

### Öffentliche Client-API (für SDK / aktivierte Apps)
- `POST /api/v1/activate` — Lizenzschlüssel + Binding-Kontext → JWT
- `POST /api/v1/recheck` — bestehendes JWT → erneuertes JWT oder Revocation-Signal
- `POST /api/v1/deactivate` — Aktivierung freigeben (z.B. Geräte-Wechsel)
- `GET /api/v1/.well-known/public-keys` — Public Keys pro Produkt für Offline-Verifikation

### Admin-API (für UI und Service-zu-Service)
- `/admin/*` — Admin-UI-Routen, geschützt durch NextAuth-Session
- `/api/admin/v1/*` — programmatischer Zugriff (Lizenzen anlegen / verlängern / widerrufen / Feature-Flags ändern, Kunden CRUD), geschützt durch Session ODER API-Key mit passendem Scope
- Lizenz-Create-Endpoint akzeptiert `externalRef` + `externalSource` als Idempotenz-Schlüssel — Doppel-Calls liefern denselben Datensatz

### Querschnitt
- Rate-Limiting auf allen öffentlichen Endpoints
- Algorithmus-Pinning bei JWT-Verifikation (kein `alg: none`, kein Algorithmus-Mismatch)
- Zod-Validierung für alle eingehenden Payloads

## Deployment-Anforderungen (unabhängig von der Rollout-Variante)
- Containerisierbar ab Tag 1: Multi-Stage-Dockerfile, `docker-compose.yml` für lokales Dev und als Production-Template
- Keine harten Annahmen über Host-Umgebung im Anwendungscode
- Alle externen Pfade, URLs, Secrets ausschließlich über Environment-Variablen
- Sowohl Single-Host-Setup (App + DB im selben Compose-Stack) als auch Multi-Host-Setup (App und DB getrennt) muss ohne Code-Änderungen möglich sein
- (Historisch: die finale Rollout-Variante sollte später entschieden werden — inzwischen entschieden und LIVE, siehe `docs/PROJEKT.md` Abschnitt „Deployment")

## SDK (`@tropicsoft/license-sdk-js`)
- Framework-agnostic Core, keine React-Abhängigkeit
- Aktivierung, Token-Cache, Re-Check, Offline-Validierung gegen Public Key
- Binding-Kontext-Erfassung je nach Umgebung automatisch (Browser → Domain; Node → Installation-ID, optional Hostname-Fingerprint)
- Konfigurierbarer Storage-Adapter (Browser → IndexedDB, Node → Dateisystem mit Default-Pfad)
- Klare Fehler-Klassen: `LicenseExpiredError`, `LicenseRevokedError`, `BindingMismatchError`, `ServerUnreachableError` (mit Grace-Period-Info)
- React-Bindings als optionales Sub-Paket
