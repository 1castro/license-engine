# Audit-Workflow vor jedem Deploy

Stand: Phase 5 (2026-05-27). Verbindlich; abgeleitet aus dem CLAUDE.md-Briefing.

> **Grundregel:** Kein Deploy — weder Staging noch Produktion — ohne dass alle drei Audits dokumentiert grün sind. Diese Regel gilt auch für scheinbar kleine Änderungen.

---

## Die drei Audits

### 1. Code-Audit
Prüft den seit dem letzten Audit geschriebenen/geänderten Code auf:
- Bugs, Edge-Cases, fehlende Fehlerbehandlung.
- Type-Sicherheit (kein impliziter `any`, keine unbegründeten Casts), dead Code, unbenutzte Imports.
- Verletzungen der Coding-Prinzipien aus `CLAUDE.md`.
- Test-Abdeckung sicherheitskritischer Pfade, fehlende Negativtests.

**Severity:** `blocker` / `major` / `minor` / `nit`. Blocker und Major **müssen** vor Deploy gefixt sein.

### 2. Workflow- & Logik-Audit
Prüft, ob End-to-End-Workflows konsistent funktionieren:
- Aktivierungs-Flow (Client → Server → Token → Cache → Offline-Validierung).
- Re-Check-Flow inkl. Widerruf-Reaktion und Lizenz-Änderungen.
- Admin-Workflows (Produkt anlegen / Kunde anlegen / Lizenz ausstellen / ändern / widerrufen / Aktivierung freigeben).
- Edge-Case-Pfade (Server unerreichbar mit Grace, Token-Ablauf, Binding-Mismatch, Key-Rotation während aktiver Sessions).
- Konsistenz zwischen Datenmodell, API-Verträgen und SDK-Verhalten.

### 3. Security-Audit
Prüft Sicherheits-Aspekte:
- Crypto-Key-Handling (Generierung, Speicherung, Rotation).
- JWT-Signing / -Verification: Algorithmus-Pinning, Claim-Validierung.
- Auth-Flow: Session, TOTP-Replay-Schutz, Brute-Force-Schutz.
- Input-Validierung an allen öffentlichen Endpoints.
- Secret-Management: keine Hardcoded Credentials, `.env` nicht im Repo, keine Secrets in Logs.
- Rate-Limiting + Brute-Force-Backoff auf Activate / Recheck / Login.
- SQL-Injection-Surface (Prisma-Patterns), XSS, CSRF an Admin-Endpoints.
- Audit-Log-Integrität: keine sensitiven Daten im Klartext, IPs gehasht.

---

## Praktische Durchführung (Claude-Code-Session)

Drei separate Sub-Agenten werden gestartet, einer pro Audit. Klare Briefings, jeder bekommt **nur das, was er prüfen soll** — keine Vermischung der Rollen.

Beispiel-Briefing pro Agent: siehe `docs/AUDIT_AGENT_BRIEFINGS.md` (kommt mit dem ersten echten Audit-Lauf).

Workflow:
1. Aktuellen git-Hash festhalten (`git rev-parse HEAD`).
2. Drei Sub-Agenten parallel starten (Agent-Tool, subagent_type `claude`).
3. Findings einsammeln, im LOGBUCH eintragen unter Datum + git-Hash.
4. Alle Blocker- und Major-Findings beheben, neuen git-Hash erzeugen.
5. Audits ggf. erneut starten (nur die mit offenen Findings, nicht zwingend alle drei).
6. Sobald alle drei dokumentiert grün sind: Deploy darf passieren.

---

## Dokumentation jedes Audit-Laufs (LOGBUCH-Format)

```
## YYYY-MM-DD — Pre-Deploy-Audit (git <hash>)

### Code-Audit
- Scope: <Dateien / Module>
- Findings: <Anzahl Blocker / Major / Minor / Nit>
- Status: grün | Findings offen

### Workflow- & Logik-Audit
- Geprüfte Flows: <Liste>
- Findings: …
- Status: …

### Security-Audit
- Geprüfte Pfade: <Liste>
- Findings: …
- Status: …

### Deploy-Freigabe
- Datum: YYYY-MM-DD
- Freigegeben durch: <Name>
- Deploy-Target: <staging | prod>
```

---

## Bei kritischen Findings nach einem bereits erfolgten Deploy

- Sofortige Rollback-Bewertung (rollback vs. hotfix).
- Hotfix-Planung im LOGBUCH festhalten.
- Erneuter Audit-Lauf vor dem Hotfix-Deploy.
- Lessons-learned-Eintrag mit Ursachen-Analyse: warum hat der Audit das Finding nicht erkannt?

---

## Verwandt
- `BACKUP.md` — vor jedem Deploy frisches Backup verifizieren.
- `PHASEN.md` — Definition-of-Done pro Phase verlangt Audit-Eintrag, falls in dieser Phase ein Deploy passiert.
- `LOGBUCH.md` — Lückenlose Audit-History.
