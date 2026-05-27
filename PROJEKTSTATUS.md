# PROJEKTSTATUS — License Engine

**Aktueller Stand:** Initialisiert + Architektur-Entscheidungen eingearbeitet + Payment-Abgrenzung dokumentiert. Wartet auf Go für Phase 1.

**Letztes Update:** 2026-05-27

---

## Was läuft
- Git-Repo lokal eingerichtet, Remote `https://github.com/1castro/license-engine.git` angebunden (leer auf GitHub).
- Doku-Grundgerüst komplett: `CLAUDE.md`, `PHASEN.md`, `LOGBUCH.md`, `CHANGELOG.md`, `PROJEKTSTATUS.md`, `README.md`, `.env.example`, `.gitignore`.
- Sechs Architektur-Entscheidungen aus Verständnisfragen eingearbeitet (License-Key-Format, KEK, JWT-Lifetime, Logging, Git-Remote, i18n).
- Payment-Nachtrag in `CLAUDE.md` als eigener Abschnitt + im Datenmodell durchgezogen (externalRef-Felder, ApiKey-Entität, idempotente Lizenz-Erstellung).

## Was hängt
- Nichts hängt — alle Vorarbeiten für Phase 1 abgeschlossen.

## Nächste Schritte
1. Zweiter Commit mit Architektur- und Payment-Updates.
2. Push auf GitHub (`main`).
3. Auf explizites „Go für Phase 1" warten.
4. Phase 1 starten (siehe `PHASEN.md`).

---

## Phasen-Übersicht
1. **Foundation** — Monorepo, Next.js, Prisma, PostgreSQL, Docker, Admin-Auth, leeres Admin-UI-Grundgerüst
2. **Core-Datenmodell + Admin-CRUD** — Produkte, Kunden, Lizenzen anlegen und verwalten
3. **Token-Engine** — Ed25519-Key-Management, JWT-Signing, Activate/Recheck/Revoke-Endpoints
4. **SDK JS/TS** — Paket, Aktivierung, Cache, Re-Check, Offline-Validierung, Binding-Erfassung, Demo-Integration
5. **Audit + Härtung** — Audit-Logging, Rate-Limiting, Backup-Integration, Health-Checks
6. **Self-Service-Portal** — Kunden-Login, Lizenz-Selbstverwaltung (spätere Iteration, kein Sprintziel der Erst-Implementierung)

Detaillierte Task-Listen siehe `PHASEN.md`.
