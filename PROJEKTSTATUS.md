# PROJEKTSTATUS — License Engine

**Aktueller Stand:** Phase 3 (Token-Engine) done. Wartet auf Go für Phase 4.

**Letztes Update:** 2026-05-27

---

## Was läuft
- Monorepo + Next.js 14.2 + TypeScript strict + Tailwind 3 + ESLint + next-intl (de/en) + pino (aus Phase 1).
- Prisma 5 + Postgres 16 mit vollständigem Schema: `AdminUser`, `ApiKey`, `Product`, `SigningKey`, `Customer`, `License`, `Activation`, `AuditLog`.
- NextAuth Credentials + TOTP mit Replay-Schutz, Bootstrap-CLI (aus Phase 1).
- Admin-API-Key-Layer (`lek_<32-base64url>`, SHA-256-Hash, Scopes, `lastUsedAt`-Tracking, Plaintext-Once-Show im Create-Dialog).
- License-Key-Generator: Crockford-Base32, 4 Gruppen × 4 Zeichen mit Checksum, transparente O/I/L/U-Normalisierung.
- AuditLog-Writer mit IP-Hash via HMAC-SHA256 (stable Pseudonymisierung), Metadata-Scrubbing, fire-and-forget bei DB-Fehlern.
- Admin-CRUD-UIs für Produkte, Kunden, Lizenzen, API-Keys (shadcn/ui + react-hook-form + Radix-Primitives). Forms POSTen an die Admin-API-Routes.
- Admin-API unter `/api/admin/v1/*`: Products/Customers/Licenses/ApiKeys, Auth via Session ODER API-Key mit Scope-Check, **License- UND Customer-Create idempotent** über `(externalRef, externalSource)`.
- Vitest mit 80 Tests grün (KeyProvider 7, Password 3, TOTP 4, Rate-Limit 2, License-Key 21, AuditLog 10, API-Key 14, API-Key-Middleware 7, Envelope 5, Token-Service 7).
- **Token-Engine** (Phase 3): Ed25519 SigningKeys werden bei Product-Create automatisch erzeugt, Private-Keys via AES-256-GCM (envelope.ts) mit KEK verschlüsselt. JWT-Signing mit `jose` (Algorithmus EdDSA, Header mit `kid`, Claims `iss/aud/sub/iat/nbf/exp/jti` + Custom `licenseKey/features/bindings`). Token-Verification pinnt Algorithmus, verhindert `alg:none` und HS256-Confusion-Attacks.
- **Public-API** unter `/api/v1/*`: `POST /activate` (License-Key + Bindings → JWT), `POST /recheck` (JWT → erneuertes JWT oder Revocation-Signal), `POST /deactivate` (Activation freigeben, idempotent), `GET /.well-known/public-keys` (SPKI-PEM für alle Produkte, incl. rotierter Keys für Grace-Window). Rate-Limiting per IP-Hash: activate 10/min, recheck 60/min.
- **BindingPolicy**: `{required?:[…], maxPerType?:{…}}`. `applyBindings` enforced required types und per-type-Quota, resurrected released Activations bei Wiedersehen.

## Was hängt
- Multi-Stage-Dockerfile-`runtime`-Target: noch nicht End-to-End-gebaut/getestet.

## Nächste Schritte
1. Auf explizites „Go für Phase 4" warten.
2. Phase 4 starten: JS/TS-SDK (`@tropicsoft/license-sdk-js`) — Framework-agnostic Core, Storage-Adapter (Browser IndexedDB, Node FS), Offline-Validierung gegen die `/.well-known/public-keys`, Grace-Period-Verhalten, Binding-Kontext-Erfassung, Fehler-Klassen, React-Bindings als optionales Sub-Paket, Demo-Integration in einer Mini-App.

---

## Phasen-Übersicht
1. **Foundation** — Monorepo, Next.js, Prisma, PostgreSQL, Docker, Admin-Auth, leeres Admin-UI-Grundgerüst
2. **Core-Datenmodell + Admin-CRUD** — Produkte, Kunden, Lizenzen anlegen und verwalten
3. **Token-Engine** — Ed25519-Key-Management, JWT-Signing, Activate/Recheck/Revoke-Endpoints
4. **SDK JS/TS** — Paket, Aktivierung, Cache, Re-Check, Offline-Validierung, Binding-Erfassung, Demo-Integration
5. **Audit + Härtung** — Audit-Logging, Rate-Limiting, Backup-Integration, Health-Checks
6. **Self-Service-Portal** — Kunden-Login, Lizenz-Selbstverwaltung (spätere Iteration, kein Sprintziel der Erst-Implementierung)

Detaillierte Task-Listen siehe `PHASEN.md`.
