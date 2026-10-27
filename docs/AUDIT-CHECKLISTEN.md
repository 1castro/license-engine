# AUDIT-CHECKLISTEN — Die drei Pre-Deploy-Audit-Agenten

> Ausgelagert aus CLAUDE.md am 10.07.2026. Detaillierte Prüf-Checklisten je Audit-Agent. Grundregel + Kurzfassung des Ablaufs: `docs/BETRIEB.md` Abschnitt 4; die verbindliche Deploy-Regel steht in `CLAUDE.md`.

## 1. Code-Audit-Agent
Prüft den seit dem letzten Audit geschriebenen/geänderten Code auf:
- Bugs, Edge-Cases, fehlende Fehlerbehandlung
- Type-Sicherheit (kein impliziter `any`, keine unbegründeten Casts), dead Code, unbenutzte Imports
- Verletzungen der Coding-Prinzipien (siehe CLAUDE.md)
- Test-Abdeckung sicherheitskritischer Pfade, fehlende Negativtests

Ergebnis: Findings-Liste mit Severity (`blocker` / `major` / `minor` / `nit`). Blocker und Major müssen vor Deploy gefixt sein.

## 2. Workflow- & Logik-Audit-Agent
Prüft, ob die End-to-End-Workflows wirklich konsistent funktionieren:
- Aktivierungs-Flow (Client → Server → Token-Ausstellung → Client-Cache → Offline-Validierung)
- Re-Check-Flow inkl. Reaktion auf Widerruf und Lizenz-Änderungen
- Admin-Workflows (Produkt anlegen, Kunde anlegen, Lizenz ausstellen, ändern, widerrufen, Aktivierung freigeben)
- Edge-Case-Pfade (Server unerreichbar mit Grace Period, Token-Ablauf, Binding-Mismatch, Key-Rotation während aktiver Sessions)
- Konsistenz zwischen Datenmodell, API-Verträgen und SDK-Verhalten

Ergebnis: Bewertung pro Flow auf Vollständigkeit und Korrektheit, mit konkret benannten Schwachstellen.

## 3. Security-Audit-Agent
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

## Audit-Dokumentation
- Jeder Audit-Lauf erzeugt einen Eintrag im LOGBUCH mit Datum, Scope (welcher Code-Stand wurde geprüft, git-Hash), Findings und Status (`grün` / `Findings offen`).
- Erst nach explizit dokumentierter „Alle drei Audits grün"-Entscheidung darf der Deploy-Schritt ausgeführt werden.
- Bei kritischen Findings nach einem bereits erfolgten Deploy: sofortige Rollback-Bewertung und Hotfix-Planung im LOGBUCH festhalten.

## Typische Sub-Agenten-Spezialisierungen im Orchestrierungs-Modell (Beispiele, nicht abschließend)
- Frontend / UI (Admin-Dashboard, shadcn/ui, Tailwind, Forms, Layout)
- Crypto & Security (JWT-Handling, Ed25519, Key-Management, Auth-Flows)
- Datenmodell & Migrations (Prisma-Schemas, Migrations, Seed-Skripte)
- API-Endpoints (REST-Routen, Zod-Validierung, Fehler-Mapping)
- SDK-Entwicklung (JS/TS-SDK, Storage-Adapter, Fehler-Klassen)
- DevOps (Docker, Compose, Health-Checks, Build-Optimierung)
- Tests (Unit, Integration, sicherheitskritische Pfade)
- Dokumentations-Updates parallel zur Implementierung
- Die drei Audit-Agenten (siehe oben)
