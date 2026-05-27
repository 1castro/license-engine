# LOGBUCH — License Engine

Chronologisches Arbeitsprotokoll. Ein Eintrag pro Sitzung. Neueste Einträge oben.

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
