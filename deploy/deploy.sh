#!/usr/bin/env bash
# =============================================================================
# License Engine — Deploy auf den Docker-Server (188.245.95.60)
#
# Strategie A (mit Jan abgestimmt): Code wird auf den Server rsynct, dort per
# `docker compose build` gebaut. Der schwere Dependency-Layer (inkl. nativem
# argon2-Compile) bleibt im Layer-Cache — bei reinen Code-Änderungen läuft nur
# `next build` neu (~1-2 Min). Kein Image-Push/-Pull, kein Full-Rebuild.
#
# Voraussetzung: SSH-Alias `Hetzner-docker` in ~/.ssh/config + `.env` liegt
# bereits unter /opt/stacks/license-engine/.env (chmod 600) auf dem Server.
#
# Erst-Bootstrap des Admin-Users (einmalig, NACH dem ersten erfolgreichen up):
#   ssh Hetzner-docker "cd /opt/stacks/license-engine && \
#     docker compose run --rm \
#       -e ADMIN_BOOTSTRAP_EMAIL=jan@tropicsoft.de \
#       -e ADMIN_BOOTSTRAP_PASSWORD='<pw>' \
#       --entrypoint 'pnpm --filter @license-engine/server admin:bootstrap' \
#       license-engine-migrate"
#   -> gibt das otpauth://-Secret aus, sofort in den Authenticator scannen.
# =============================================================================
set -euo pipefail

SSH_HOST="${SSH_HOST:-Hetzner-docker}"
CODE_DIR="/opt/license-engine/code"
STACK_DIR="/opt/stacks/license-engine"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "==> Zielverzeichnisse sicherstellen"
ssh "$SSH_HOST" "mkdir -p '$CODE_DIR' '$STACK_DIR'"

echo "==> Code rsyncen nach $CODE_DIR (ohne node_modules/.next/.git/.env)"
rsync -az --delete \
  --exclude 'node_modules' \
  --exclude '.next' \
  --exclude '.git' \
  --exclude '.env' \
  --exclude '.env.*' \
  --exclude '*.log' \
  --exclude '.DS_Store' \
  --exclude 'coverage' \
  --exclude 'deploy/' \
  "$REPO_ROOT/" "$SSH_HOST:$CODE_DIR/"

echo "==> Compose-File in den Stack-Ordner kopieren"
scp "$REPO_ROOT/deploy/compose.yaml" "$SSH_HOST:$STACK_DIR/compose.yaml"

echo "==> Build (Layer-Cache) + Stack hochfahren"
# migrate läuft als one-shot vor der App (service_completed_successfully).
ssh "$SSH_HOST" "cd '$STACK_DIR' && docker compose build && docker compose up -d"

echo "==> Auf Health warten"
ssh "$SSH_HOST" '
  for i in $(seq 1 20); do
    state=$(docker inspect -f "{{.State.Health.Status}}" license-engine 2>/dev/null || echo "starting")
    if [ "$state" = "healthy" ]; then echo "license-engine: healthy"; exit 0; fi
    echo "  ... $state ($i/20)"; sleep 3
  done
  echo "license-engine wurde nicht healthy"; docker logs license-engine --tail 40; exit 1
'

echo "==> Fertig. Erreichbar im reverse-proxy-Netz unter http://license-engine:3000"
