# PROJEKTSTATUS — License Engine

**Aktueller Stand:** Initialisiert. Wartet auf Go für Phase 1.

**Letztes Update:** 2026-05-27

---

## Was läuft
- Projekt-Setup abgeschlossen: Git-Repo, Doku-Grundgerüst, Phasen-Plan.
- Verständnisfragen an Jan vorbereitet (siehe Chat).

## Was hängt
- Antworten auf die offenen Architektur-Entscheidungen (License-Key-Format, Master-Encryption-Key, JWT-Lifetime, Logging-Stack, Git-Remote, i18n-Tag-1).

## Nächste Schritte
1. Antworten von Jan auf Verständnisfragen einarbeiten — `PHASEN.md` und `CLAUDE.md` ggf. präzisieren.
2. Auf explizites „Go für Phase 1" warten.
3. Phase 1 starten (siehe `PHASEN.md`).

---

## Phasen-Übersicht
1. **Foundation** — Monorepo, Next.js, Prisma, PostgreSQL, Docker, Admin-Auth, leeres Admin-UI-Grundgerüst
2. **Core-Datenmodell + Admin-CRUD** — Produkte, Kunden, Lizenzen anlegen und verwalten
3. **Token-Engine** — Ed25519-Key-Management, JWT-Signing, Activate/Recheck/Revoke-Endpoints
4. **SDK JS/TS** — Paket, Aktivierung, Cache, Re-Check, Offline-Validierung, Binding-Erfassung, Demo-Integration
5. **Audit + Härtung** — Audit-Logging, Rate-Limiting, Backup-Integration, Health-Checks
6. **Self-Service-Portal** — Kunden-Login, Lizenz-Selbstverwaltung (spätere Iteration, kein Sprintziel der Erst-Implementierung)

Detaillierte Task-Listen siehe `PHASEN.md`.
