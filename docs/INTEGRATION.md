# Integration-Leitfaden — Apps gegen die License Engine lizenzieren

Wie eine beliebige eigene Anwendung (Web-App, Website, Service) sich gegen die
License Engine lizenziert. Sprach- und framework-unabhängig über die REST-API;
das JS/TS-SDK ist nur ein Komfort-Wrapper für JS-Umgebungen.

**Status:** Engine-Seite **fertig** — alle für die erste Integration nötigen
Bausteine (Abschnitt 5) sind gebaut, auditiert und live. Das hier beschriebene
Modell ist bewusst **universell**: es gilt für jede künftige App. Der Fahrdienst
(Abschnitt 4) ist nur **ein konkretes Beispiel** — app-spezifische Details gehören
in die jeweilige App-Integration, nicht in die Engine oder dieses Grundmodell.

---

## 1. Zwei getrennte Ebenen

Lizenzierung hat **zwei unabhängige Ebenen**, die nicht vermischt werden dürfen:

| Ebene | Bindung | Frage | Wirkung bei Verletzung |
|---|---|---|---|
| **App-Lizenz** | `domain` | Ist *diese Installation* lizenziert? | **Ganze App gesperrt** (Sperr-Seite für alle) |
| **Seat** | `account` (oder `device`) | Darf *dieser Nutzer/dieses Gerät* mitmachen? | **Nur dieser eine** abgewiesen, Rest arbeitet weiter |

Die App geht nur dann komplett zu, wenn die Mandanten-Lizenz selbst
ungültig/abgelaufen/widerrufen ist. Ein erreichtes Seat-Limit betrifft immer
nur den überzähligen Nutzer.

---

## 2. Token-Modell + Grace (gilt für alle Apps)

1. **Aktivieren** (`POST /api/v1/activate`): Lizenzschlüssel + Binding-Kontext →
   signiertes JWT (Ed25519) mit Ablaufdatum (`exp`, Default 7 Tage).
2. **Offline validieren:** Die App verifiziert das JWT lokal gegen den Public Key
   (aus `GET /api/v1/.well-known/public-keys`, gecacht). Kein Server-Call pro Request.
3. **Periodischer Re-Check** (`POST /api/v1/recheck`, Default täglich): erneuert das
   Token oder liefert ein Revocation-/Expired-Signal.
4. **Grace bei Server-Ausfall:** Ist die Engine kurz nicht erreichbar (Container-
   Neustart, Netzwerk), läuft die App mit dem gecachten Token **bis `exp`** weiter.
   Kommt die Engine zurück, wird beim nächsten Re-Check erneuert. Erst nach Ablauf
   ohne erfolgreichen Re-Check → harte Sperre. **Kein Selbst-DoS.**

**Token-Cache (universell):** Die App cacht Tokens **server-seitig**, pro Binding
(eine App-Lizenz/Domain + ein Token je Seat). Solange ein gültiges, nicht
abgelaufenes Token im Cache liegt, wird **offline** validiert — kein Engine-Call.
Ein echter Call (`activate`/`recheck`) erfolgt nur, wenn kein/ein abgelaufenes
Token vorliegt oder das Re-Check-Intervall fällig ist. So bleibt die Engine-Last
unabhängig von der Request-Zahl der App.

**Erst-Aktivierung = fail-closed (Empfehlung):** Hat die App für ein Binding noch
**nie** ein Token geholt und ist die Engine genau dann nicht erreichbar, gibt es
keinen gecachten Zustand, auf den man sich verlassen könnte → im Zweifel **sperren**
(klare Meldung „Lizenz konnte nicht geprüft werden"), nicht durchlassen. Die
Grace-Period (Punkt 4) greift bewusst nur, wenn schon einmal erfolgreich ein Token
ausgestellt wurde.

---

## 3. Binding-Modelle

Pro Lizenz definiert eine `bindingPolicy`, welche Bindungen Pflicht sind und wie
viele gleichzeitige Aktivierungen pro Typ erlaubt sind (`maxPerType`):

| Typ | Wofür | Beispiel |
|---|---|---|
| `domain` | Web-App/Website an Domain binden (Anti-Copy) | `fidibus.fahrdienst.pro` |
| `account` | Seat pro Benutzer-Login (Köpfe zählen) | Fahrer-Account |
| `device` | Seat pro Gerät (Desktop-Apps mit echter Geräte-ID) | EM-Client-Stil |
| `installation` | Seat pro Installation/Instanz | Node-Tool |

**Seat-Lebenszyklus = „benannter Platz" (Variante A):** Eine Aktivierung belegt
ihren Platz **dauerhaft**, bis sie aktiv freigegeben wird (`POST /api/v1/deactivate`
oder über die Verwaltung). Erneutes Aktivieren desselben Bindings reaktiviert den
alten Platz (kein verbrannter Seat). Beim Erreichen von `maxPerType` lehnt die
Engine mit `binding_max_exceeded` (409) ab.

**Belegung ist aktivitätsbasiert, nicht login-gebunden (universell + wichtig):**
Ein Seat wird gesichert, sobald ein Nutzer/Gerät mit seinem Account **aktiv ist** —
nicht am Login-*Ereignis*. Die App prüft den Seat des aktuellen Nutzers im
**Per-Request-Pfad** (dieselbe Middleware, die den App-Lizenz-Check macht), nicht
in einem Login-Hook. Das ist entscheidend, weil beim Rollout der Lizenzierung in
eine laufende App bereits viele Nutzer eingeloggt sind — sie dürfen nicht zum
Neu-Login gezwungen werden. Weil `activate` desselben Bindings **idempotent** ist
(reaktiviert/zählt nicht doppelt, bumpt nur „zuletzt aktiv"), ist der Per-Request-
Aufruf gefahrlos; in Kombination mit dem Token-Cache (Abschnitt 2) entsteht pro
Account nur dann echter Engine-Traffic, wenn das Token fehlt/abgelaufen ist.

> **Rollout-Hinweis:** Da jeder gerade arbeitende Account beim ersten Request einen
> benannten Platz holt, muss `maxPerType` **≥ Zahl der real aktiven Accounts** sein,
> sonst bekommt der überzählige mitten im Arbeiten die Limit-Meldung. „Benannte
> Plätze" heißt *verschiedene, nicht freigegebene* Accounts — **nicht** „gleichzeitig
> online". Plätze ausgeschiedener Nutzer werden freigegeben (App `deactivate` bei
> Account-Löschung **oder** zentral im Portal); die Spalte „zuletzt aktiv" zeigt
> inaktive Plätze.

**Metadata-Konvention (universell, pro Binding optional mitschicken):** Beim
`activate` kann pro Binding eine `metadata` mitgegeben werden, die rein der
**Anzeige** in Admin-UI/Portal dient (nicht sicherheitsrelevant, kein Hash):

| Feld | Bedeutung | Beispiel Fahrdienst |
|---|---|---|
| `value` | eindeutiger, stabiler **Anker** (wird gehasht, identifiziert das Binding) | Member-ID des Fahrers |
| `displayName` | sprechender Klarname für die Liste | „Anne Hirschmüller" |
| `identifier` | kurzes **Kürzel** (zweite Spalte, falls Namen mehrdeutig) | Member-ID / Login-Kürzel |

Der Anker ist `value` (stabil halten, nicht der wechselbare Klarname!). `displayName`
und `identifier` sind frei und projektabhängig befüllbar — die Engine zeigt sie nur an.

**„Zuletzt aktiv" (`lastSeenAt`) — Granularität:** wird bei `activate` und bei jedem
`recheck` auf „jetzt" gesetzt. Es bedeutet „zuletzt mit der Engine gesprochen", nicht
sekundengenaue Online-Anzeige — die Auflösung entspricht dem Re-Check-Intervall
(Default täglich). Für „wer nutzt seinen Platz noch?" völlig ausreichend.

---

## 4. Konkreter Fall: Fahrdienst (PHP-Web-App)

- **Stack:** PHP (AppGini-Erbe), MariaDB, Nginx+PHP-FPM. Kein JS-SDK → **REST-API
  direkt** per `curl`.
- **Installationen:** Test (`tester.fahrdienst.pro`) + 2 Mandanten (FidiBus,
  Berlin Shuttle), je eigener Container + DB + Domain + Lizenz.
- **Lizenzmodell pro Mandant:**
  - `bindingPolicy = { required: ['domain'], maxPerType: { domain: 1, account: 100 } }`
  - `domain` = Mandanten-Domain (Anti-Copy, immer 1).
  - `account` = Fahrer-Login → 100 Seats (zum Start, rein darstellend; aktuell
    nutzen die Mandanten faktisch unbegrenzt). Köpfe, nicht Geräte: ein Fahrer mit
    Tablet **und** Handy = **1** Seat.
- **Ablauf in der App:**
  1. **App-Lizenz-Check (Ebene 1):** `lib.php` (lädt bei jedem Request) prüft das
     gecachte Domain-Token (offline). Liegt keins vor, holt der **PHP-Server** es
     server-zu-server (`activate { domain }`, Key aus der Config). Ungültig/
     abgelaufen/widerrufen → **Sperr-Seite** (Login geht, danach Meldung statt App
     — „Variante B"). Betrifft die ganze Installation, unabhängig vom Nutzer.
  2. **Seat-Sicherung (Ebene 2) — aktivitätsbasiert, NICHT am Login:** `lib.php`
     kennt den aktuell angemeldeten Nutzer und sichert dessen Seat im Hintergrund
     (`activate { account: <fahrer-kennung>, metadata }`, server-zu-server, mit
     Token-Cache pro Account). So bekommt auch jeder **schon eingeloggte** Fahrer
     beim nächsten Request lautlos seinen Platz — kein Neu-Login nötig. Limit voll +
     neuer Fahrer → Meldung „Platz-Limit erreicht, Verwalter muss einen Platz
     freigeben". Bestehende Fahrer arbeiten normal weiter.
  3. **Seat-Freigabe:** Fahrer-Account gelöscht/deaktiviert → App ruft `deactivate`
     mit dem `account`-Binding → Platz frei. Zusätzlich/alternativ gibt der Mandanten-
     Admin Plätze **zentral im License-Portal** frei — es gibt **kein** Lizenz-Panel
     in der Fahrdienst-App selbst.
  4. **Re-Check:** täglich (Cron oder lazy beim ersten Request des Tages) → Token
     erneuern + Revocation prüfen + „zuletzt aktiv" aktualisieren.
- **Token-Cache:** server-seitig (Tabelle in der Mandanten-DB oder Datei im
  Container), pro App-Lizenz + pro Seat. *(Detail beim Implementieren festlegen.)*
- **Lizenzschlüssel + Engine-URL:** in `config.php`/`config_impressum.php`
  (mandantenspezifisch, wird beim Deploy nicht überschrieben). Engine intern über
  das Docker-Netz oder über `https://license.tropicsoft.de`. *(Anbindungsweg beim
  Implementieren festlegen.)*

---

## 5. Engine-To-dos (vor der ersten Integration)

✅ **(1) Seat-Zahlen in der Antwort.** `activate`/`recheck` liefern ein
`seats`-Array, ein Eintrag je policy-relevantem Binding-Typ, damit jede App
„37 von 100 Plätzen" anzeigen kann:
```json
"seats": [ { "type": "account", "used": 37, "max": 100 },
           { "type": "domain",  "used": 1,  "max": 1 } ]
```
`max: null` bedeutet unbegrenzt. Typen ohne `required`/`maxPerType` erscheinen
nicht im Array.

✅ **(2) Admin-Aktivierungs-Verwaltung (zentral, für tropicsoft).** Im License-
Admin-UI unter `/admin/licenses/[id]/activations`: Seat-Auslastung + belegte
Plätze sehen + einzeln freigeben (Inline-Modal).

✅ **(3) Service-API für Seat-Management (optional, für Read/Sync durch Apps).**
Per API-Key (Scopes `activations:read` / `activations:write`) abgesicherte Endpoints:
- `GET /api/admin/v1/licenses/{id}/activations` — Plätze auflisten + `seats`-Übersicht.
- `POST /api/admin/v1/licenses/{id}/activations/{activationId}/release` — Platz freigeben.

API-Keys können optional an **eine** Lizenz gebunden werden (`ApiKey.licenseId`):
ein gebundener Key sieht/verwaltet nur seine eigene Lizenz (fremde → 404). So
bekommt jeder Mandant einen isolierten Key.

> **Verwaltung läuft zentral übers License-Portal.** Der Kunde (Mandanten-Admin)
> sieht und verwaltet seine Plätze im Self-Service-Portal der License Engine —
> Apps bekommen **kein** eigenes Lizenz-Panel. Die Service-API (3) ist nur für
> Fälle gedacht, in denen eine App Seat-Zahlen *anzeigen* (read) oder ein externes
> System *synchronisieren* will; für die normale Verwaltung wird sie nicht gebraucht.

Punkte (1) + (3) sind **generisch** — jede künftige Seat-App (Kreuzliste, …)
nutzt dieselbe API/dasselbe Portal. Einmal in der Engine gebaut, überall wiederverwendbar.

---

## 6. Testplan (Fahrdienst-Tester, kleine Seats)

1. Engine-To-dos fertig + isoliert getestet.
2. Produkt „Fahrdienst" + Kunde + **Test-Lizenz mit `account: 2`** in der Engine anlegen.
3. Tester anbinden: 2 Fahrer einloggen → beide bekommen Platz. 3. Fahrer → Meldung
   „Limit erreicht". Einen freigeben → 3. Fahrer kommt rein.
4. Grace testen: Engine kurz stoppen → App läuft weiter; Engine zurück → Re-Check ok.
5. Erst nach grünem Test → Ausrollen auf Mandanten (Seat-Limit 100), pro Mandant
   mit Backup + Smoke-Test (Fahrdienst-Deploy-Disziplin).

---

## 7. Arbeitsteilung

- **License-Engine-Chat (hier):** baut + testet die Engine-Seite (Abschnitt 5),
  legt Produkt/Kunde/Lizenz an, orchestriert und kontrolliert.
- **Fahrdienst-Chat:** baut die App-Seite (Domain-Lizenz-Check in `lib.php`,
  Sperr-Seite, aktivitätsbasierte Seat-Sicherung im Per-Request-Pfad, Token-Cache
  pro Account, freundliche Limit-Meldung) — **kein** Lizenz-Panel in der App,
  Verwaltung läuft übers Portal. Auf Basis eines kopierbaren Prompts aus dem
  License-Engine-Chat, gegen die fertige Engine-API.
