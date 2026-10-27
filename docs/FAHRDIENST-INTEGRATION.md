# Lizenz-Integration Fahrdienst

> Ausgelagert aus dem Chat-Memory (`project_license_integration_fahrdienst.md`) am 10.07.2026.
> Status: **LIVE auf beiden Mandanten** (FidiBus + Berlin Shuttle), Engine v1.7.0, Offline-Verify Ed25519.

## 1. Ausgangslage & Ziel

Seit 2026-05-28: Die License Engine soll reale Apps lizenzieren. Erster Testfall **Fahrdienst** (PHP-Web-App, `coding-projects/fahrdienst/`), danach **Kreuzliste** (JS/TS).

**Why:** Jan will weg von der rein kosmetischen Lizenz-ID (statischer String in `config_impressum.php`, keine Prüfung) hin zu echter Durchsetzung — und ein Seat-Modell („N Nutzer pro Lizenz", hochzählen, Limit, freigeben — EM-Client-Vorbild).

## 2. Abgestimmtes Konzept (Details: `license-engine/docs/INTEGRATION.md`)

- Zwei Ebenen: **App-Lizenz** (`domain`-Binding → ganze App gesperrt wenn ungültig, „Variante B": Login geht, dann Sperr-Seite) + **Seat** (`account`-Binding → nur überzähliger Nutzer abgewiesen).
- Fahrdienst zählt **Köpfe (Fahrer-Accounts)**, nicht Geräte. 100 Seats/Mandant (rein darstellend zum Start). Ein Fahrer mit mehreren Geräten = 1 Seat.
- Token + Grace bis `exp` (kein Selbst-DoS bei Engine-Ausfall), Offline-Validierung, periodischer Re-Check.
- Seat = „benannter Platz" (Variante A): bleibt belegt bis aktive Freigabe.
- PHP nutzt die **REST-API direkt** (kein JS-SDK; SDK erst für Kreuzliste).

## 3. Engine-Vorarbeit (war offen, per 2026-06-03 alle ✅)

1. Seat-Zahlen (`seatsUsed`/`seatsMax`) in activate/recheck-Response. ✅
2. Admin-UI: Aktivierungen pro Lizenz sehen + freigeben (gab's nur im Kunden-Portal, nicht im Admin). ✅
3. Service-API (API-Key) zum **Auflisten** der Seats fürs App-Admin-Panel (Freigeben via `deactivate` existierte schon). ✅

Punkte 1+3 sind generisch für alle Seat-Apps. Erledigungsnachweis: `license-engine/docs/INTEGRATION.md` §5.

## 4. Arbeitsteilung

License-Engine-Chat baut+testet die Engine-Seite und orchestriert; der Fahrdienst-Chat (separat, kennt das PHP-Projekt) baut die App-Seite auf Basis eines kopierbaren Prompts und gegen die fertige Engine-API. Reihenfolge: Engine zuerst, dann App. (Konvention: kopierbare Blöcke für andere Chats.)

## 5. Fahrdienst-seitiges Integrations-Audit (2026-06-03, reine Analyse)

Im Fahrdienst-Chat wurde (NICHT implementiert, nur Analyse) das Audit `fahrdienst/docs/LIZENZIERUNG-INTEGRATION-AUDIT.md` erstellt (im Projekt-Root-`docs/`, NICHT im deploybaren `code/`). Verifiziert per Multi-Agent-Recherche + adversarialer Review.

**Kern-Designentscheidungen:**

1. Ebene-1+2 zentral in `lib.php` nach `logInMember()` (Z. 109) verankern; Admin separat über `admin/incCommon.php`.
2. Variante-B-Sperre über die `HOMEPAGE`-Konstante als Diskriminator (nur in `index.php:12` gesetzt).
3. Seat-Anker = `getLoggedMemberID()` (lowercase memberID, PK in `membership_users`), Seat NUR für GroupID 19 (FAHRER); deactivate-Hook in `admin/pageDeleteMember.php:8` mit Account-Token.
4. Token-Cache = **DB-Tabelle** in der Mandanten-DB (Datei scheidet aus: `rsync --delete`), Vorlage `membership_usersessions`, Migration 004, NICHT in die 4 Tabellen-Registries.
5. **Offline-JWT-Verify** (PHP 8.3 + libsodium, SPKI-PEM → Roh-32-Byte, App hat NUR Public Key, kein Private Key) empfohlen, Online-recheck-only als Fallback.
6. `licenseKey`/`productSlug`/`domain` in `config_impressum.php` (geschützt vor Deploy), Engine-URL via ENV.

### Q1–Q7 vom Engine-Chat FINAL beantwortet (Engine v1.5.1, kein Engine-Change)

- productSlug = `fahrdienst` für alle 3 Instanzen (unveränderlich).
- Engine-URL intern `http://license-engine:3000` (gemeinsames Docker-Netz `reverse-proxy`, no-ip-Rate-Bucket).
- recheck = 24 h, exp/Grace = 168 h.
- account-value = `strtolower(memberID)` (Engine hasht serverseitig), Normalisierung bei activate UND deactivate IDENTISCH (Engine normalisiert nicht).
- **Test-Lizenz bindingPolicy `{domain:1, account:2}`, Mandanten `{domain:1}` = account UNBEGRENZT (Jan)** → Folge: account erscheint NICHT in `seats[]`, 409 nur auf Test testbar (trotzdem defensiv codieren).
- Q7: `php -m` am Container prüfen (sodium → Offline-Verify, sonst Online-only).

### Verbindliche Arbeitsweise (Live)

1. Test-first hart — alles erst auf tester.fahrdienst.pro grün, NIE direkt auf Mandanten.
2. Lückenloses Rollback-Change-Doc `fahrdienst/docs/LIZENZIERUNG-CHANGELOG.md` (Datei / Migration-Reverse-SQL / Config je Eintrag).
3. **Kill-Switch `licensing_enabled` in `config_impressum.php`** (false → Smoke → true; `lib.php` überspringt bei false beide Ebenen = schnellster Live-Rollback ohne Deploy/DB).
4. Pro Mandant Backup → Migration → Smoke, nie parallel, FidiBus vor Shuttle.

Damals blockiert auf: Engine legt Test-Lizenz an + liefert Test-licenseKey/Engine-URL UND Jans Freigabe — dann Implementierung (Migration 004 + `license/`-Modul + lib.php-Einhängung) auf Test. Audit-Doc `fahrdienst/docs/LIZENZIERUNG-INTEGRATION-AUDIT.md` enthält alles final.

## 6. Implementierung auf Test (2026-06-03, grün, Jan-Freigabe für Test war erteilt)

Engine live v1.5.1, Test-Lizenz `«Test-Schlüssel, siehe Engine-Admin-UI»` (tester.fahrdienst.pro, bindingPolicy `{domain:1, account:2}`), Engine intern `http://license-engine:3000` (HTTP 200), PHP 8.3.22 mit ext-sodium + curl → **Offline-Verify**.

**Implementiert:**
- `code/license/license.php` (Klasse `FD_License`, ~1 Datei): Offline-Ed25519-Verify via libsodium SPKI → Roh-32, Engine-curl-Client, DB-Token-Cache, Sperr-/Limit-Seiten.
- Migration `004_create_license_token_cache.sql` (NICHT in AppGini-Registries).
- Kill-Switch `licensing_enabled` in `config_impressum.php`.
- Einhängung in `lib.php` (nach logInMember, Ebene 1+2), `admin/incCommon.php` (Ebene 1, kein Seat), `index.php` (Variante-B-Block via HOMEPAGE-Flag + exit), `admin/pageDeleteMember.php` (deactivate).

**E2E auf Test grün:**
- Kill-Switch false = App unverändert.
- Ebene 1: Domain-activate + Cache + Offline-Verify (echt = true / manipuliert = false).
- Ebene 2: Seat nur GroupID 19, Offline-Cache-Hit, 409 → Platz-Limit-Seite, deactivate → Platz frei.

**Bug gefixt:** activate muss domain-Pflicht-Binding immer mitschicken (Seat = domain + account, sonst 400).

**Pflicht-Audit (3 Agenten) + Re-Audit alle GRÜN** (XSS-Escaping, Prepared Statements, Log-Redaktion, TLS, Recheck-Backoff gefixt).

**Deploy-Lesson:** `sync-to-test.sh` synct `config_impressum.php` aus lokal → Kill-Switch nur lokal pflegen. `error_log` → `/var/log/php_errors.log` (nicht docker logs).

Doku: `fahrdienst/docs/LIZENZIERUNG-INTEGRATION-AUDIT.md` + `LIZENZIERUNG-CHANGELOG.md` (mit Reverse-SQL/Rollback). Test-Umgebung: licensing aktiv, 1 Seat (testuser).

## 7. Sichtbare Lizenz-Anzeige im Projektinfo-Modal (2026-06-03, Engine v1.6.0)

Auf Jans Feedback „sehe nichts von der Lizenz": `FD_License::status()` zeigt read-only (rein lokal aus Cache/Token, kein Engine-Call, try/catch):

- Status-Badge (aktiv / abgelaufen / widerrufen / nicht aktiviert),
- belegte Fahrer-Plätze (X/max bzw. X unbegrenzt),
- zuletzt geprüft,
- maskierter licenseKey.

Verwaltung bleibt im Portal (nur Anzeige). **Engine v1.6.0** liefert optionale Anzeige-Claims im Token + Response: `licensee` (Kundenname), `plan`, `licenseExpiresAt` (echtes Lizenz-Ende), `perpetual` — die App liest sie offline aus den Token-Claims und zeigt „licensed to" + „Gültig bis <Datum>/unbegrenzt" + „Plan" authentisch aus der Lizenz (Fallback config `lizenz`).

**WICHTIG:** „Gültig bis" = `licenseExpiresAt`/`perpetual`, NIEMALS Token-`exp` (= 7d Offline-Grace, wird NICHT angezeigt). Alle Claim-Werte htmlspecialchars-escaped (Re-Audit Security + Code grün). Test-Modal zeigt: `Fahrdienst Tester | aktiv | Gültig bis 03.06.2027 | 1/2`. Lizenznehmer aus Lizenz, nicht mehr aus Config.

## 8. Suspend-Feature „Lizenz pausiert" (2026-06-03, Engine v1.7.0)

Lizenz reversibel pausierbar: recheck → `status:suspended`, activate → 403 `license_suspended`. App sperrt + zeigt eigene „Lizenz pausiert"-Seite (≠ abgelaufen/widerrufen), aber Cache/Seats werden NICHT verworfen/neu aktiviert → nahtlose Reaktivierung sobald wieder active.

- **Migration `005_add_suspended_status.sql`** (ENUM `status` um `suspended` erweitert — Bug gefunden: ohne das wäre `cache_mark('suspended')` still an „Data truncated" gescheitert).
- `license.php`: `ebene1()` prüft gecachten Status (Nicht-Aktiv bleibt gesperrt, bei suspended Recheck alle 5 Min via `recheck_due_seconds`), `apply_verdict_app()` suspended-Zweig + **`grace_ok()`** (Grace NUR für zuvor aktive Lizenz → suspended/revoked/expired bleiben bei Engine-Ausfall gesperrt, kein Fehl-Entsperren), `cache_mark()` setzt `last_recheck_at` (Backoff).
- Modal-Badge „pausiert" (amber).
- **Audit (Logik + Code/Security) grün**, simuliert auf Test grün (Block + Cache-Erhalt + Reaktivierung).
- Offen (optional): Live-Suspend-Test (Engine-Chat pausiert Test-Lizenz kurz).
- **Mandanten-Rollout-Migrationen: 004 + 005.**

## 9. Rollout auf die Mandanten (2026-06-04 — KOMPLETT, LIVE)

| Mandant | licenseKey | Domain | Besonderheit |
|---|---|---|---|
| FidiBus | `«FidiBus-Schlüssel, siehe Engine-Admin-UI bzw. config_impressum.php»` | fidibus.fahrdienst.pro | perpetual, bindingPolicy `{domain:1}` (account unbegrenzt) |
| Berlin Shuttle | `«Shuttle-Schlüssel, siehe Engine-Admin-UI bzw. config_impressum.php»` | shuttle.fahrdienst.pro | perpetual, bindingPolicy `{domain:1}` (account unbegrenzt) |

Beide **perpetual** → Modal „Valid: unlimited", recheck 1 h.

**Pro Mandant ausgerollt:** frisches Backup → Migration 004/005 → Lizenz-Keys in `config_impressum.php` (deploy-geschützt, NUR auf dem Server, NICHT im Repo) → Kill-Switch false → true → Smoke + Jan-Sign-off (Modal grün, Seats zählen hoch). Reihenfolge: Kreuzliste-Chat zuerst (Migr. 001-003 + dormant Lizenz-Code), dann License-Chat aktiviert.

**Lizenz-Code committed:** master `4560651` (`license/license.php`, `lib.php`, `index.php`, `incCommon.php`, `admin/incCommon.php`, `admin/pageDeleteMember.php`, Migrationen 004/005, `config_impressum.php.example`). `config_impressum.php` bewusst NICHT committed (mandantenspezifisch + License-Key).

**Rollback je Mandant:**
- `licensing_enabled=false` (sofort, eine Zeile),
- Config-Backup `/tmp/<mandant>_config_impressum_prelicense.bak`,
- `DROP TABLE license_token_cache`,
- DB-Backup `/tmp/backup_fahrdienst_<mandant>_PRE-LICENSE_2026-06-04_*.sql`.

Modal-Lizenzblock englisch (License status / Valid / Seats).

**Betriebsverhalten:** Pause greift ≤ 1 h (recheck), Engine-Ausfall toleriert ≤ 7 Tage (Grace/exp), Token-Cache server-seitig (DB, nicht Browser).

## 10. Offene Punkte (Stand der Memory-Auslagerung 10.07.2026)

- `git push origin master` (wartet auf Jans Go).
- Optional: Live-Suspend-Test (Engine-Chat pausiert Test-Lizenz kurz).

## Verwandte Dokumente

- `license-engine/docs/INTEGRATION.md` — generisches Integrationskonzept + Engine-Vorarbeiten §5
- `fahrdienst/docs/LIZENZIERUNG-INTEGRATION-AUDIT.md` — finales App-seitiges Audit
- `fahrdienst/docs/LIZENZIERUNG-CHANGELOG.md` — lückenloses Rollback-Change-Doc
- Memory-Verweise: `project_license_engine`, `project_kreuzliste`, `project_fahrdienst`, `feedback_kopierbare_bloecke`
