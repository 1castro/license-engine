# CLAUDE.md — License Engine

Dieses Dokument ist das verbindliche Projektbriefing. Es wird im Verlauf verfeinert; jede Änderung am Briefing ist im LOGBUCH zu vermerken.

## Sprache & Kommunikation
- Wir sprechen ausschließlich Deutsch im Projekt-Chat und in der Projekt-Dokumentation.
- Wir duzen uns in allen Antworten.
- Eingaben des Users erfolgen häufig per Speech-to-Text — kleine Tipp-/Übersetzungsfehler ignorieren, Inhalt verstehen und korrekt umsetzen.

---

## Repository & Konventionen
- Repo: https://github.com/1castro/license-engine (privat)
- GitHub-Workflow Single Source of Truth: `~/Documents/coding-projects/infrastruktur/GITHUB.md`
- Auth: HTTPS via macOS Keychain, lokale git-Config pro Repo (`Jan Franke <jan@tropicsoft.de>`)
- Commit-Messages: Deutsch, Titel ≤ 72 Zeichen, Body mit Begründung + Verweisen auf Doku-Files
- Pre-Push-Sicherheits-Check ist Pflicht (siehe `infrastruktur/GITHUB.md`)

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
- **Keine Preise, Rechnungen, Steuer-Logik im Datenmodell.** Auch nicht „nur als optionales Feld vorbereitet". Bleibt komplett draußen.

## Architektur-Entscheidungen (fix)

### Server
- Zentraler Multi-Product-Service. EIN Server verwaltet Lizenzen für alle Produkte.
- Hybrid-Validierung: Client aktiviert online → erhält signiertes JWT → validiert danach offline → periodischer Re-Check beim Server.
- Token-Format: JWT mit Ed25519-Signatur. Public Key wird mit dem SDK verteilt, Private Key bleibt serverseitig. Key-Rotation muss vorgesehen sein.
- Re-Check-Intervall: Default 24h, konfigurierbar pro Produkt.
- **JWT-Lifetime + Grace Period:** Default `exp = 7 Tage`, Re-Check alle 24h, Grace = `exp`. Bei Server-Unerreichbarkeit darf der Client bis zum Ablauf von `exp` weiter validieren, danach harter Validation-Failure. `exp` und `recheckIntervalHours` pro Produkt konfigurierbar. Refresh-Token-Modell bleibt optional als `revocationStrategy = refresh` für Produkte mit Bedarf nach schnellerem Widerruf.

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
- Heute: nur Owner (ich), Passwort + TOTP-2FA.
- Datenbankschema ab Tag 1 rollen-fähig (Owner / Operator / ReadOnly), im UI aber vorerst nicht exponiert.

### Service-zu-Service-Auth (Admin-API)
- Für externe Systeme (späteres Payment-Sync-Modul) gibt es einen zweiten Auth-Pfad: API-Keys mit Scopes.
- Tag-1: Datenmodell (`ApiKey`) + Auth-Middleware-Hook vorbereitet; UI-Verwaltung erst implementieren, wenn ein konkreter Konsument existiert.
- API-Keys werden im Klartext nur einmal bei der Erstellung angezeigt, in der DB liegen nur Hashes.
- Scopes folgen dem Schema `<resource>:<action>` (z.B. `licenses:write`, `licenses:revoke`, `customers:write`).

### Widerruf
- Pro Produkt konfigurierbar via `revocationStrategy`.
- Default: greift beim nächsten Re-Check (24h-Granularität).
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
- `Product`: id, slug, name, featureCatalog (JSON), revocationStrategy, signingKeyId, recheckIntervalHours, jwtLifetimeHours (default 168 = 7 Tage), licenseKeyPrefix (default `TROP`)
- `SigningKey`: id, productId (nullable für globalen Default-Key), publicKey, privateKeyEncrypted, algorithm (`Ed25519`), createdAt, rotatedAt, isActive
- `Customer`: id, email, name, company (nullable), notes, externalRef (nullable, indiziert), externalSource (nullable, z.B. `stripe`|`paddle`|`manual`), createdAt
- `License`: id, customerId, productId, licenseKey (UNIQUE, Format `TROP-XXXX-XXXX-XXXX-XXXX` mit Checksum), type (`subscription`|`perpetual`), expiresAt (nullable), featureFlags (JSON), bindingPolicy (JSON), status (`active`|`revoked`|`expired`), revokedAt, revocationReason, externalRef (nullable, indiziert), externalSource (nullable), createdAt
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

## SDK (`@tropicsoft/license-sdk-js`)
- Framework-agnostic Core, keine React-Abhängigkeit
- Aktivierung, Token-Cache, Re-Check, Offline-Validierung gegen Public Key
- Binding-Kontext-Erfassung je nach Umgebung automatisch (Browser → Domain; Node → Installation-ID, optional Hostname-Fingerprint)
- Konfigurierbarer Storage-Adapter (Browser → IndexedDB, Node → Dateisystem mit Default-Pfad)
- Klare Fehler-Klassen: `LicenseExpiredError`, `LicenseRevokedError`, `BindingMismatchError`, `ServerUnreachableError` (mit Grace-Period-Info)
- React-Bindings als optionales Sub-Paket

## Dokumentations-Pflicht
Folgende Dateien werden kontinuierlich aktuell gehalten:
- `CLAUDE.md` — dieses Briefing + Konventionen, wird im Verlauf verfeinert
- `LOGBUCH.md` — chronologisches Arbeitsprotokoll, ein Eintrag pro Sitzung
- `PROJEKTSTATUS.md` — aktueller Stand, was läuft, was hängt, nächste Schritte
- `CHANGELOG.md` — versionierte Änderungen (Keep a Changelog)
- `PHASEN.md` — detaillierte Phasen- und Task-Planung

## Coding-Prinzipien
- Gründliche Impact-Analyse vor nicht-trivialen Änderungen. Keine Quick-Fixes ohne Folgekosten-Abschätzung.
- Defensive Programmierung: externe Eingaben mit Zod validieren, Fehler explizit behandeln, niemals stille `catch`-Blöcke.
- Schichten-Trennung: Domain / Infrastructure / API / UI. Domain-Logik ohne Framework-Imports.
- Sicherheitskritische Pfade (Token-Signing/-Verification, Lizenz-Validierung, Bindungs-Prüfung, Crypto-Key-Handling) sind durch Unit- UND Integration-Tests abgedeckt.
- Kommentare wo Logik nicht offensichtlich oder Begründung relevant ist (insbesondere bei Crypto-/Auth-Code).
- Keine probabilistischen Aussagen in Code-Kommentaren oder Doku, wo Präzision möglich ist.
- Secrets niemals committen. `.env.example` mit Platzhaltern, echte `.env` nur lokal.

## Sprach-Konventionen
- Code, Variablen, Klassen, Datei-Namen: Englisch
- Projekt-Dokumentation (CLAUDE.md, LOGBUCH.md, PROJEKTSTATUS.md, CHANGELOG.md, PHASEN.md): Deutsch
- Admin-UI: Deutsch (i18n-fähig vorbereitet, Englisch als Fallback-Locale)
- Commit-Messages: Englisch, Conventional Commits

## Deployment-Anforderungen (unabhängig von der späteren Variante)
- Containerisierbar ab Tag 1: Multi-Stage-Dockerfile, `docker-compose.yml` für lokales Dev und als Production-Template
- Keine harten Annahmen über Host-Umgebung im Anwendungscode
- Alle externen Pfade, URLs, Secrets ausschließlich über Environment-Variablen
- Sowohl Single-Host-Setup (App + DB im selben Compose-Stack) als auch Multi-Host-Setup (App und DB getrennt) muss ohne Code-Änderungen möglich sein
- Die finale Rollout-Variante (Docker-Container im bestehenden Docker-Host vs. dedizierter Server) wird später im Projekt-Chat entschieden

## Arbeitsweise: Orchestrierungs-Modell

Der Hauptchat ist Orchestrator, nicht Solo-Implementierer. Implementierungsarbeit wird so weit wie sinnvoll an spezialisierte Sub-Agenten / Sub-Tasks delegiert. Der Orchestrator koordiniert, integriert Ergebnisse, hält die Dokumentation aktuell und ist die einzige Schnittstelle zu Jan.

### Typische Sub-Agenten-Spezialisierungen (Beispiele, nicht abschließend)
- Frontend / UI (Admin-Dashboard, shadcn/ui, Tailwind, Forms, Layout)
- Crypto & Security (JWT-Handling, Ed25519, Key-Management, Auth-Flows)
- Datenmodell & Migrations (Prisma-Schemas, Migrations, Seed-Skripte)
- API-Endpoints (REST-Routen, Zod-Validierung, Fehler-Mapping)
- SDK-Entwicklung (JS/TS-SDK, Storage-Adapter, Fehler-Klassen)
- DevOps (Docker, Compose, Health-Checks, Build-Optimierung)
- Tests (Unit, Integration, sicherheitskritische Pfade)
- Dokumentations-Updates parallel zur Implementierung
- Die drei Audit-Agenten (siehe Audit-Workflow)

### Orchestrator-Regeln
- Sub-Agenten werden parallel oder sequenziell beauftragt, je nach Abhängigkeiten zwischen Aufgaben.
- Routine-Entscheidungen (konkrete Tailwind-Klassen, interne Funktions-Signaturen, Test-Aufbau im Detail, Naming innerhalb klar definierter Konventionen) trifft der Orchestrator oder die Sub-Agenten selbst und dokumentiert sie im LOGBUCH.
- Jan wird **nur für echte Entscheidungen** unterbrochen: Richtungswechsel, Trade-offs mit Architektur-Auswirkung, fehlende Briefing-Information, ambivalente Sicherheits-Trade-offs.
- Bei Erreichen größerer Meilensteine (Ende einer Phase, abgeschlossenes Sub-Modul, abgeschlossener Audit) liefert der Orchestrator ungefragt eine kompakte Status-Zusammenfassung — keine Rückfrage, nur Info.

### Pflicht-Format für Rückfragen an Jan
Wenn der Orchestrator eine Entscheidung von Jan braucht, dann immer mit allen vier Elementen:
1. Klare Beschreibung der Entscheidung und ihrer Auswirkung
2. 2–3 konkret formulierte Optionen (konkret in Code/Architektur, nicht in abstrakten Begriffen)
3. Eine empfohlene Option mit knapper Begründung, warum sie für diesen Fall am besten passt
4. Hinweis auf Trade-offs der jeweils anderen Optionen

Keine offenen „was möchtest du?"-Fragen ohne Vorschlag. Keine Sammel-Fragen, die mehrere unabhängige Entscheidungen vermischen.

## Audit-Workflow (Pflicht vor jedem Deploy)

**Grundregel:** Kein Deploy — weder Staging noch Produktion — ohne vorgelagertes Audit. Drei separate Audit-Agenten werden gestartet. Erst wenn alle drei dokumentiert grün sind, darf der Deploy-Schritt erfolgen. Diese Regel gilt unverhandelbar und auch für scheinbar kleine Änderungen — Sicherheits- und Lizenzcode hat keine „triviale Änderung".

### 1. Code-Audit-Agent
Prüft den seit dem letzten Audit geschriebenen/geänderten Code auf:
- Bugs, Edge-Cases, fehlende Fehlerbehandlung
- Type-Sicherheit (kein impliziter `any`, keine unbegründeten Casts), dead Code, unbenutzte Imports
- Verletzungen der Coding-Prinzipien (siehe oben)
- Test-Abdeckung sicherheitskritischer Pfade, fehlende Negativtests

Ergebnis: Findings-Liste mit Severity (`blocker` / `major` / `minor` / `nit`). Blocker und Major müssen vor Deploy gefixt sein.

### 2. Workflow- & Logik-Audit-Agent
Prüft, ob die End-to-End-Workflows wirklich konsistent funktionieren:
- Aktivierungs-Flow (Client → Server → Token-Ausstellung → Client-Cache → Offline-Validierung)
- Re-Check-Flow inkl. Reaktion auf Widerruf und Lizenz-Änderungen
- Admin-Workflows (Produkt anlegen, Kunde anlegen, Lizenz ausstellen, ändern, widerrufen, Aktivierung freigeben)
- Edge-Case-Pfade (Server unerreichbar mit Grace Period, Token-Ablauf, Binding-Mismatch, Key-Rotation während aktiver Sessions)
- Konsistenz zwischen Datenmodell, API-Verträgen und SDK-Verhalten

Ergebnis: Bewertung pro Flow auf Vollständigkeit und Korrektheit, mit konkret benannten Schwachstellen.

### 3. Security-Audit-Agent
Prüft Sicherheits-Aspekte:
- Crypto-Key-Handling (Generierung, verschlüsselte Speicherung, Rotation, sichere Vernichtung)
- JWT-Signing/-Verification: Algorithmus-Pinning (kein `alg: none`, keine Algorithmus-Verwechslung), Claim-Validierung (`iss`, `aud`, `exp`, `nbf`)
- Auth-Flow: Session-Handling, TOTP-Validierung mit Replay-Schutz, Brute-Force-Schutz / Rate-Limiting auf Login
- Input-Validierung an allen öffentlichen Endpoints (Zod-Schemas vorhanden und vollständig)
- Secret-Management: keine Hardcoded Credentials, `.env` nicht im Repo, keine Secrets in Logs
- Rate-Limiting und Abuse-Schutz auf Activate/Recheck-Endpoints
- SQL-Injection (Prisma-Patterns), XSS, CSRF an Admin-Endpoints
- Audit-Log-Integrität: keine sensitiven Daten im Klartext, IPs gehashed

Ergebnis: Befundbericht mit Severity. Blocker-Findings verhindern Deploy zwingend.

### Audit-Dokumentation
- Jeder Audit-Lauf erzeugt einen Eintrag im LOGBUCH mit Datum, Scope (welcher Code-Stand wurde geprüft, git-Hash), Findings und Status (`grün` / `Findings offen`).
- Erst nach explizit dokumentierter „Alle drei Audits grün"-Entscheidung darf der Deploy-Schritt ausgeführt werden.
- Bei kritischen Findings nach einem bereits erfolgten Deploy: sofortige Rollback-Bewertung und Hotfix-Planung im LOGBUCH festhalten.
