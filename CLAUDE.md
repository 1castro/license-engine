# CLAUDE.md — License Engine

Zentraler, selbst gehosteter Multi-Product-Lizenz-Server: stellt signierte JWTs (Ed25519) aus, Hybrid-Validierung (online aktivieren → offline validieren → Re-Check), Integration via JS/TS-SDK + REST-API. **LIVE:** https://license.tropicsoft.de — Stand/Roadmap: `docs/PROJEKT.md`.

Eckdaten: Next.js 14 + TypeScript strict, Prisma + PostgreSQL 16, pnpm-Monorepo (`apps/server`, `packages/sdk-js`, `packages/shared-types`). Details: `docs/ARCHITEKTUR.md`.

## Sprache & Kommunikation
- Ausschließlich Deutsch im Projekt-Chat und in der Projekt-Doku; wir duzen uns.
- Eingaben oft per Speech-to-Text — kleine Tipp-/Übersetzungsfehler ignorieren, Inhalt umsetzen.
- Code, Variablen, Datei-Namen: Englisch. Doku: Deutsch. Admin-UI: Deutsch (i18n, EN-Fallback).

## Repository & Git
- Repo: https://github.com/1castro/license-engine (privat). Workflow-SSoT: `~/coding-projects/infrastruktur/GITHUB.md`.
- Auth: HTTPS via macOS Keychain, lokale git-Config (`Jan Franke <jan@tropicsoft.de>`).
- Commit-Messages: Deutsch, Titel ≤ 72 Zeichen, Body mit Begründung + Doku-Verweisen. (Altes Briefing nannte an anderer Stelle „Englisch, Conventional Commits" — gelebte Praxis im Repo ist Deutsch.)
- Pre-Push-Sicherheits-Check ist Pflicht (siehe GITHUB.md).

## Harte Abgrenzung: kein Payment
Payment/Billing ist **explizit kein Teil** dieser Engine (kommt später als externes PSP + Sync-Modul). Erlaubt sind NUR Anzeige-Metadaten (`planName`, `priceDisplay`, `billingInterval`; ab v1.6.0 Token-Anzeige-Felder `licensee`/`plan`/`licenseExpiresAt`/`perpetual` — keine E-Mail/PII). Design-Auflagen dafür (externalRef, Idempotenz, API-Keys): `docs/ARCHITEKTUR.md`.

## Coding-Prinzipien
- Gründliche Impact-Analyse vor nicht-trivialen Änderungen; keine Quick-Fixes ohne Folgekosten-Abschätzung.
- Defensiv: externe Eingaben mit Zod validieren, Fehler explizit behandeln, niemals stille `catch`-Blöcke.
- Schichten-Trennung Domain / Infrastructure / API / UI; Domain-Logik ohne Framework-Imports.
- Sicherheitskritische Pfade (Token-Signing/-Verification, Lizenz-Validierung, Bindungs-Prüfung, Key-Handling) brauchen Unit- UND Integration-Tests.
- Kommentare, wo Logik nicht offensichtlich ist (v.a. Crypto-/Auth-Code); keine vagen Aussagen, wo Präzision möglich ist.
- Secrets niemals committen: `.env.example` mit Platzhaltern, echte `.env` nur lokal.

## Deployment-Regeln
- Containerisierbar: keine harten Host-Annahmen im Code; alle Pfade/URLs/Secrets nur über ENV-Variablen.
- Single-Host- und Multi-Host-Setup (App/DB getrennt) müssen ohne Code-Änderung möglich sein.

## Audit-Workflow (Pflicht vor JEDEM Deploy, unverhandelbar)
- Kein Deploy (Staging oder Produktion) ohne drei separate, dokumentiert grüne Audits: **Code**, **Workflow/Logik**, **Security**. Gilt auch für „kleine" Änderungen — Lizenz-/Sicherheitscode hat keine triviale Änderung.
- Severity `blocker`/`major`/`minor`/`nit`; Blocker + Major müssen vor Deploy gefixt sein.
- Jeder Lauf → LOGBUCH-Eintrag (Datum, git-Hash, Findings, Status); Deploy erst nach dokumentierter „alle drei grün"-Entscheidung. Kritisches Finding nach Deploy → sofortige Rollback-Bewertung + Hotfix-Plan ins LOGBUCH.
- Checklisten je Agent: `docs/AUDIT-CHECKLISTEN.md`; Ablauf: `docs/BETRIEB.md` §4.

## Arbeitsweise: Orchestrierung
- Hauptchat = Orchestrator, nicht Solo-Implementierer: delegiert an Sub-Agenten (Rollen-Beispiele: `docs/AUDIT-CHECKLISTEN.md`), integriert Ergebnisse, hält Doku aktuell, einzige Schnittstelle zu Jan.
- Routine-Entscheidungen selbst treffen, im LOGBUCH dokumentieren. Jan nur für echte Entscheidungen unterbrechen (Richtungswechsel, Architektur-/Sicherheits-Trade-offs, fehlende Briefing-Info).
- Bei größeren Meilensteinen ungefragt kompakte Status-Zusammenfassung (Info, keine Rückfrage).
- Rückfragen an Jan IMMER mit: (1) Entscheidung + Auswirkung, (2) 2–3 konkrete Optionen, (3) Empfehlung mit Begründung, (4) Trade-offs der anderen. Keine offenen „was möchtest du?"-Fragen, keine Sammel-Fragen.

## Doku-Pflicht
- Jede Änderung am Briefing (dieser Datei) im LOGBUCH vermerken.
- Kontinuierlich aktuell halten: CLAUDE.md, CHANGELOG.md (Keep a Changelog), docs/PROJEKT.md, docs/LOGBUCH.md (ein Eintrag pro Sitzung), docs/INTEGRATION.md, docs/BETRIEB.md.

## Doku-Landkarte
- `docs/ARCHITEKTUR.md` — fixe Architektur-Entscheidungen, Payment-Abgrenzung im Detail, Tech-Stack, Datenmodell, API-Skizze, SDK-Design (ausgelagert aus CLAUDE.md)
- `docs/PROJEKT.md` — Vision, aktueller Stand, Roadmap
- `docs/LOGBUCH.md` — chronologisches Arbeitsprotokoll
- `docs/INTEGRATION.md` — wie eine App sich gegen die Engine lizenziert
- `docs/FAHRDIENST-INTEGRATION.md` — konkrete Integration des Fahrdienst-Systems
- `docs/BETRIEB.md` — Backup/Restore, Mail, Cron-Jobs, Audit-Ablauf
- `docs/AUDIT-CHECKLISTEN.md` — Checklisten der drei Audit-Agenten + Sub-Agenten-Rollen (ausgelagert aus CLAUDE.md)
- `CHANGELOG.md` — versionierte Änderungen (Keep a Changelog)
- `README.md` — Kurzüberblick + Einstieg
