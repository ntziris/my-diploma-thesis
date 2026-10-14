#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."   # the scripts root: deployment.testnet.json lives here
D=deployment.testnet.json
P=logs/publish.testnet.json
CONFIG=../frontend/src/config.ts
U=logs/upgrade.testnet.json
STEP=${1:-publish}

if [ "$STEP" = publish ]; then
  [ -s "$P" ] || { echo "$P is missing or empty" >&2; exit 1; }
  pkg=$(jq -r '.objectChanges[] | select(.type=="published") | .packageId' $P)
  sender=$(jq -r '.transaction.data.sender' $P)
  by_type() { jq -r --arg t "$1" '.objectChanges[] | select(.type=="created" and (.objectType|endswith($t))) | .objectId' $P; }
  catalog=$(by_type '::artwork::Catalog')
  regG=$(by_type '::registry::Gallery>')
  regS=$(by_type '::registry::Source>')
  publisher=$(by_type '::package::Publisher')
  adminCap=$(by_type '::admin::AdminCap')
  upgradeCap=$(by_type '::package::UpgradeCap')
  params=$(by_type '::admin::Params')
  stats=$(by_type '::stats::Stats')
  channelPolicy=$(by_type '::report::ChannelPolicy')
  channelStats=$(by_type '::report::ChannelStats')
  # every id must be present, or config.ts would be patched with an empty string
  for v in pkg sender catalog regG regS publisher adminCap upgradeCap params stats channelPolicy channelStats; do
    [[ "${!v}" =~ ^0x[0-9a-f]{64}$ ]] || { echo "$v not found in $P (got '${!v}')" >&2; exit 1; }
  done
  new=$(jq -n \
    --arg network testnet \
    --arg digest "$(jq -r .digest $P)" \
    --arg at "$(jq -r .timestampMs $P)" \
    --arg pkg "$pkg" --arg catalog "$catalog" --arg regG "$regG" --arg regS "$regS" \
    --arg publisher "$publisher" --arg adminCap "$adminCap" --arg upgradeCap "$upgradeCap" \
    --arg params "$params" --arg stats "$stats" --arg channelPolicy "$channelPolicy" \
    --arg channelStats "$channelStats" --arg authority "$sender" \
    --slurpfile old $D \
    '{network:$network, publishDigest:$digest, publishedAt:$at, packageId:$pkg,
      catalog:$catalog, galleryRegistry:$regG, sourceRegistry:$regS, publisher:$publisher,
      adminCap:$adminCap, upgradeCap:$upgradeCap, params:$params, stats:$stats,
      channelPolicy:$channelPolicy, channelStats:$channelStats,
      authority:$authority, addresses:$old[0].addresses, devices:$old[0].devices,
      enclavePcrs:$old[0].enclavePcrs}')
  echo "$new" | jq --arg p "$pkg" '. + {latestPackageId: $p, reportPackageId: $p}' > $D
  echo "recorded package $pkg in $D"
  # patch the frontend configuration in place
  for key in packageId latestPackageId galleryRegistry sourceRegistry params channelPolicy catalog stats channelStats adminCap authority; do
    val=$(jq -r ".$key" $D)
    sed -i -E "s|(\b$key: ')0x[0-9a-f]+(')|\1$val\2|" $CONFIG
    grep -qE "\b$key: '$val'" $CONFIG || { echo "failed to patch $key in $CONFIG" >&2; exit 1; }
  done
  echo "patched $CONFIG"
  grep -nE "packageId|galleryRegistry|sourceRegistry|params:|channelPolicy|catalog:|stats:|channelStats|adminCap" $CONFIG
fi

if [ "$STEP" = display ]; then
  pkg=$(jq -r .packageId $D)
  LOG=logs/setup-display.testnet.log
  [ -s "$LOG" ] || { echo "$LOG is missing; run chain/setup-testnet.sh display first" >&2; exit 1; }
  pairs=$(grep -oE "ObjectID: 0x[0-9a-f]+|ObjectType: [^ ]+" "$LOG" | paste - - | sed -E 's/ObjectID: //; s/\tObjectType: / /')
  art=$(echo "$pairs" | grep "display_registry::Display<$pkg::artwork::Artwork>" | cut -d' ' -f1 | head -1)
  frac=$(echo "$pairs" | grep "display_registry::Display<$pkg::fraction::Fraction>" | cut -d' ' -f1 | head -1)
  [ -n "$art" ] && [ -n "$frac" ] || { echo "Display objects not found in $LOG for $pkg" >&2; exit 1; }
  regd=$(grep -oE "Transaction Digest: [A-Za-z0-9]+" logs/setup-registries.testnet.log | head -1 | cut -d' ' -f3)
  dispd=$(grep -oE "Transaction Digest: [A-Za-z0-9]+" "$LOG" | head -1 | cut -d' ' -f3)
  jq --arg a "$art" --arg f "$frac" --arg r "$regd" --arg d "$dispd" \
    '.displayArtwork=$a | .displayFraction=$f | .setupDigests={registries:$r, display:$d}' $D > $D.tmp && mv $D.tmp $D
  echo "recorded Display<Artwork> $art and Display<Fraction> $frac"
fi

if [ "$STEP" = upgrade ]; then
  [ -s "$U" ] || { echo "$U is missing or empty" >&2; exit 1; }
  jq -e . "$U" >/dev/null 2>&1 || { echo "$U is not JSON; the CLI printed:" >&2; head -5 "$U" >&2; exit 1; }
  latest=$(jq -r '.objectChanges[] | select(.type=="published") | .packageId' $U)
  [ -n "$latest" ] || { echo "no published package in $U" >&2; exit 1; }
  jq --arg p "$latest" --arg d "$(jq -r .digest $U)" '.latestPackageId=$p | .upgradeDigests=((.upgradeDigests // []) + [$d])' $D > $D.tmp && mv $D.tmp $D
  sed -i -E "s|(\blatestPackageId: ')0x[0-9a-f]+(')|\1$latest\2|" $CONFIG
  grep -qE "\blatestPackageId: '$latest'" $CONFIG || { echo "failed to patch latestPackageId in $CONFIG" >&2; exit 1; }
  echo "recorded upgrade: latest package $latest (original $(jq -r .packageId $D))"
  grep -nE "packageId|latestPackageId" $CONFIG
fi
