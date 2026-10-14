#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."   # the scripts root: deployment.testnet.json lives here
D=deployment.testnet.json
SITE=${1:?usage: $0 <site-url> [--dry-run]}
MODE=${2:-}
AUTHORITY=$(jq -r .authority $D); ORIG=$(jq -r .packageId $D)
DA=$(jq -r .displayArtwork $D); DF=$(jq -r .displayFraction $D)
[ "$(sui client active-address)" = "$AUTHORITY" ] || { echo "switch to the authority first" >&2; exit 1; }
LOG=logs/update-site-url.testnet.log
[ -f "$LOG" ] && cp "$LOG" "$LOG.prev"
sui client ptb $MODE \
  --move-call "0x2::display::edit" "<$ORIG::artwork::Artwork>" @$DA "\"link\"" "\"$SITE/artwork/{id}\"" \
  --move-call "0x2::display::edit" "<$ORIG::artwork::Artwork>" @$DA "\"project_url\"" "\"$SITE\"" \
  --move-call "0x2::display::update_version" "<$ORIG::artwork::Artwork>" @$DA \
  --move-call "0x2::display::edit" "<$ORIG::fraction::Fraction>" @$DF "\"link\"" "\"$SITE/artwork/{artwork_id}\"" \
  --move-call "0x2::display::edit" "<$ORIG::fraction::Fraction>" @$DF "\"project_url\"" "\"$SITE\"" \
  --move-call "0x2::display::update_version" "<$ORIG::fraction::Fraction>" @$DF \
  --gas-budget 50000000 > "$LOG" 2>&1 || { echo "failed, see $LOG" >&2; tail -20 "$LOG" >&2; exit 1; }
DIGEST=$(grep -oE "Transaction Digest: [A-Za-z0-9]+" "$LOG" | head -1 | awk '{print $3}')
grep -q "Status: Success" "$LOG" || { echo "not successful, see $LOG" >&2; exit 1; }
[ -n "$MODE" ] || { jq --arg s "$SITE" --arg d "$DIGEST" '.siteUrl = $s | .setupDigests.siteUrl = $d' $D > $D.tmp && mv $D.tmp $D; }
echo "display templates now point to $SITE (digest $DIGEST)"
