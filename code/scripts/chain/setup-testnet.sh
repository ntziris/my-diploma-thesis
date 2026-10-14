#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."   # the scripts root: deployment.testnet.json lives here
D=deployment.testnet.json
PKG=$(jq -r .packageId $D)
CAP=$(jq -r .adminCap $D)
PARAMS=$(jq -r .params $D)
REG_G=$(jq -r .galleryRegistry $D)
REG_S=$(jq -r .sourceRegistry $D)
PUBLISHER=$(jq -r .publisher $D)
AUTHORITY=$(jq -r .authority $D)
GALLERY_A=$(jq -r '.addresses["gallery-a"]' $D)
GALLERY_B=$(jq -r '.addresses["gallery-b"]' $D)
INSPECTOR=$(jq -r '.devices.inspector' $D)
CLOCK=0x6
ROYALTY_BPS=${ROYALTY_BPS:-400}   # 4%, the first tier of the Greek droit de suite
AGGREGATOR=${AGGREGATOR:-https://aggregator.walrus-testnet.walrus.space}
SITE=${SITE:-https://art-tokenization.duckdns.org}
STEP=${1:-all}   # registries | display | all
MODE=${2:-}      # --dry-run to simulate

active=$(sui client active-address)
if [ "$active" != "$AUTHORITY" ]; then
  echo "active address is $active, expected the authority $AUTHORITY" >&2
  echo "run: sui client switch --address authority" >&2
  exit 1
fi

run() {
  local log=$1; shift
  [ -f "$log" ] && cp "$log" "$log.prev"
  sui client ptb $MODE "$@" 2>&1 | tee "$log" | { grep -E "Transaction Digest|execution status|^│ Status|^Error|error" || true; }
  local rc=${PIPESTATUS[0]}
  if [ "$rc" -ne 0 ] || grep -qE "Status: Failure|^Error" "$log"; then
    echo "transaction failed, see $log" >&2
    exit 1
  fi
}

record_digest() {
  local log=$1 key=$2
  local digest
  digest=$(grep -oE "Transaction Digest: [A-Za-z0-9]+" "$log" | head -1 | awk '{print $3}')
  [ -n "$digest" ] || return 0
  jq --arg k "$key" --arg d "$digest" '.setupDigests[$k] = $d' "$D" > "$D.tmp" && mv "$D.tmp" "$D"
  echo "recorded setupDigests.$key = $digest"
}

if [ "$STEP" = registries ] || [ "$STEP" = all ]; then
  echo "== registries and royalty ($ROYALTY_BPS bps)"
  run logs/setup-registries.testnet.log \
    --move-call "$PKG::registry::register" "<$PKG::registry::Gallery>" @$REG_G @$CAP @$GALLERY_A '"Gallery A"' '""' @$CLOCK \
    --move-call "$PKG::registry::register" "<$PKG::registry::Gallery>" @$REG_G @$CAP @$GALLERY_B '"Gallery B"' '""' @$CLOCK \
    --move-call "$PKG::registry::register" "<$PKG::registry::Source>" @$REG_S @$CAP @$INSPECTOR '"Ανεξάρτητος επιθεωρητής"' '"inspector"' @$CLOCK \
    --move-call "$PKG::admin::set_royalty_bps" @$PARAMS @$CAP $ROYALTY_BPS @$CLOCK
  record_digest logs/setup-registries.testnet.log registries
fi

if [ "$STEP" = display ] || [ "$STEP" = all ]; then
  echo "== display templates (v2)"
  run logs/setup-display.testnet.log \
    --move-call "$PKG::display::register" @0xd @$PUBLISHER "\"$AGGREGATOR\"" "\"$SITE\"" \
    --assign caps \
    --transfer-objects "[caps.0, caps.1]" @$AUTHORITY
  record_digest logs/setup-display.testnet.log display
fi
