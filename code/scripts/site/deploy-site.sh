#!/usr/bin/env bash
# Usage: ./deploy-site.sh [--epochs 30]
# site-builder reads ~/.config/walrus/sites-config.yaml and pays from the authority wallet
set -euo pipefail
cd "$(dirname "$0")/.."   # the scripts root: deployment.testnet.json lives here
EPOCHS=30
[ "${1:-}" = --epochs ] && EPOCHS=$2
AUTHORITY=$(jq -r .authority deployment.testnet.json)
[ "$(sui client active-address)" = "$AUTHORITY" ] || { echo "switch to the authority first: sui client switch --address authority" >&2; exit 1; }
(cd ../frontend && pnpm build >/dev/null && grep -q object_id dist/ws-resources.json)
site-builder deploy --epochs "$EPOCHS" --site-name art-tokenization ../frontend/dist 2>&1 | sed 's/\x1b\[[0-9;]*[mK]//g' | grep -v "INFO\|^\s*$" | tail -12
SITE=$(jq -r .object_id ../frontend/dist/ws-resources.json)
B36=$(site-builder convert "$SITE" 2>/dev/null | tail -1)
jq --arg s "$SITE" --arg b "$B36" --arg t "$(date -u +%FT%TZ)" --arg e "$EPOCHS" \
  '.walrusSite = ((.walrusSite // {}) + {objectId:$s, b36:$b, siteName:"art-tokenization", epochs:($e|tonumber), publishedAt:$t})' \
  deployment.testnet.json > d.tmp && mv d.tmp deployment.testnet.json
echo "site $SITE (b36 $B36) recorded"
