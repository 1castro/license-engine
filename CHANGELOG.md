# Changelog

Alle nennenswerten Änderungen an diesem Projekt werden hier dokumentiert.

Format orientiert sich an [Keep a Changelog](https://keepachangelog.com/de/1.1.0/),
Versionierung nach [Semantic Versioning](https://semver.org/lang/de/).

## [Unreleased]

### Added
- Initiale Projekt-Doku (`CLAUDE.md`, `LOGBUCH.md`, `PROJEKTSTATUS.md`, `PHASEN.md`, `CHANGELOG.md`, `README.md`, `.gitignore`, `.env.example`).
- Architektur-Entscheidungen aus Verständnisfragen in `CLAUDE.md` festgeschrieben: License-Key-Format `TROP-XXXX-XXXX-XXXX-XXXX` mit Checksum, KEK mit `KeyProvider`-Interface (File > ENV), JWT `exp = 7d` + Grace, `pino`-Logging, `next-intl` Tag 1.
- Payment/Billing-Abgrenzung als eigener Abschnitt in `CLAUDE.md`: externe Sync-Modul-Anbindung später, License Engine bleibt Payment-frei.
- Datenmodell um `License.licenseKey` (UNIQUE), `Customer/License.externalRef` + `externalSource`, `ApiKey`-Entität (Service-zu-Service-Auth) erweitert.
- API-Oberfläche in öffentliche Client-API und Admin-API (Session ODER API-Key) getrennt; Lizenz-Create idempotent über `(externalRef, externalSource)`.
- Phasen-Plan in `PHASEN.md` um Logging-, i18n-, KeyProvider-, externalRef-, Idempotenz- und API-Key-Tasks verfeinert.
- GitHub-Remote `https://github.com/1castro/license-engine.git` angebunden; Repo-Eintrag in `infrastruktur/GITHUB.md` ergänzt.

### Changed

### Deprecated

### Removed

### Fixed

### Security
