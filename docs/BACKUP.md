# Backup-Konzept — License Engine

Stand: Phase 5 (2026-05-27)

Dieses Dokument beschreibt, was zu sichern ist, getrennt nach Vertraulichkeits-Stufe, und liefert ein Beispiel-Skript für den DB-Dump.

---

## Was muss gesichert werden

### 1. PostgreSQL-Datenbank
Enthält alles, was den Lizenz-Zustand ausmacht: Produkte, Kunden, Lizenzen, Aktivierungen, Audit-Log, Admin-User, **verschlüsselte** Signing-Private-Keys.

**Wichtig:** Ein DB-Backup alleine ist nutzlos — die Private-Keys sind mit dem KEK envelope-encrypted. Ohne den KEK lassen sich keine neuen Tokens signieren und schon ausgestellte Tokens nach einer Restore nicht weiter validieren (na ja, doch — die Public-Keys sind ja im Klartext, aber kein neuer Token möglich).

### 2. KEK (`ENCRYPTION_KEY` bzw. `ENCRYPTION_KEY_FILE`)
Der Master-Encryption-Key. **Muss getrennt von der DB aufbewahrt werden**, sonst hebt Backup-Verschlüsselung sich selbst auf.

- Empfohlene Aufbewahrung: Passwort-Manager (Bitwarden / vaultwarden) im Notes-Feld eines dedizierten Eintrags.
- Bei Rotation des KEK (siehe „KEK-Rotation" weiter unten) müssen alle alten Backups archiviert und alle Private-Keys re-wrapped werden.

### 3. NextAuth-Secret (`NEXTAUTH_SECRET`)
Wird als HMAC-Salt für IP-Hashes im Audit-Log verwendet. Ein Restore mit anderem `NEXTAUTH_SECRET` lässt alte IP-Hashes nicht mehr mit neuen korrelieren — Audit-Trail-Lücke, kein Daten-Verlust. Trotzdem im Passwort-Manager mit ablegen.

### 4. Bootstrap-Credentials
Nicht backup-relevant — sind nur einmalig zum Anlegen des ersten Admin-Users gebraucht.

---

## Beispiel: tägliches DB-Backup (lokal getestet)

```bash
#!/usr/bin/env bash
# /opt/license-engine/scripts/backup.sh — als cron alle 24h
set -euo pipefail

STAMP=$(date -u +%Y%m%dT%H%M%SZ)
DEST=/var/backups/license-engine
mkdir -p "$DEST"

# pg_dump aus dem Postgres-Container heraus, custom-format (komprimiert + parallelisierbar bei restore)
docker exec license-engine-postgres pg_dump \
  --format=custom \
  --no-owner --no-privileges \
  -U license_engine -d license_engine \
| gzip > "$DEST/db-${STAMP}.dump.gz"

# Aufräumen: nur die letzten 30 Tage behalten
find "$DEST" -name 'db-*.dump.gz' -mtime +30 -delete

# Optional: Off-Site-Replikation (rsync, restic, B2, …)
```

**Cron-Eintrag:**
```
0 3 * * *  /opt/license-engine/scripts/backup.sh >> /var/log/license-engine-backup.log 2>&1
```

---

## Restore-Test (Pflicht alle 90 Tage)

```bash
# 1. Frischen Postgres aus dem Compose-Stack starten (separater Volume!)
docker compose -f docker-compose.restore-test.yml up -d postgres-restore

# 2. Restore in den Test-Container
gunzip -c db-XXXXXXXXTXXXXXXZ.dump.gz | docker exec -i postgres-restore \
  pg_restore --no-owner --no-privileges -U license_engine -d license_engine

# 3. Smoke-Test: Server gegen die restorete DB starten + ein /api/v1/recheck mit
#    einem alten Token feuern. Wenn das durchgeht, ist Restore OK.
#    (Wichtig: KEK aus dem Backup-Zeitpunkt nutzen, nicht den aktuellen!)
```

Jeder Restore-Test wird im LOGBUCH protokolliert mit Datum, Dump-Stand und Smoke-Test-Ergebnis.

---

## KEK-Rotation (irregulärer Vorgang)

Falls der KEK kompromittiert sein könnte (z.B. ein Ex-Mitarbeiter hatte Zugriff):

1. Neuen KEK generieren: `openssl rand -base64 32`.
2. Server in **Read-Only-Modus** schalten (kein neuer Activate, keine Key-Rotation).
3. Re-Wrap-Skript laufen lassen: alle `SigningKey.privateKeyEncrypted`-Werte mit altem KEK entschlüsseln, mit neuem KEK wieder verschlüsseln, atomar in einer Transaktion zurückschreiben.
4. `ENCRYPTION_KEY` / `ENCRYPTION_KEY_FILE` auf neuen Wert umstellen, Server neu starten.
5. Read-Only-Modus aufheben.
6. Alte Backups als kompromittiert markieren (nicht löschen — wegen Audit-Pflicht), neue Backups ab jetzt mit neuem KEK assoziiert.

Re-Wrap-Skript ist Phase-5-Backlog (kommt mit der ersten geplanten Rotation).

---

## Was *nicht* gesichert werden muss

- `node_modules/`, `.next/`, build-output — reproduzierbar aus `package.json` + `pnpm-lock.yaml` + git.
- Der Source-Code selbst — liegt in https://github.com/1castro/license-engine.
- Log-Files (pino-Output) — operativ, nicht audit-relevant; das Audit-Log lebt in der DB und ist Teil des DB-Dumps.

---

## Off-Site-Strategie (offen)

Tag-1-Implementierung: Backups liegen lokal auf dem Deploy-Host. Off-Site (Hetzner-Storage-Box, Backblaze B2, rsync auf Homelab) wird mit dem konkreten Deploy-Setup entschieden (welcher Host / welche Variante laut PHASEN.md Phase-1-Deployment-Anforderungen).
