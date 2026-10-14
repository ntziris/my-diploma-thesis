#!/usr/bin/env bash
# Usage: ./submit-report.sh read <device> --artwork 0x.. --condition 1 [--nonce 7]
# Usage: ./submit-report.sh close <device> --artwork 0x.. [--relayer enclave-payer] [--wait] [--dry-run]
set -euo pipefail
cd "$(dirname "$0")/.."   # the scripts root: deployment.testnet.json lives here
D=deployment.testnet.json

PHASE=${1:?usage: $0 read|close <device-name> [options]}
DEVICE=${2:?usage: $0 read|close <device-name> [options]}
shift 2
ARTWORK= CONDITION= NONCE= RELAYER=enclave-payer URL=${ENCLAVE_URL:-http://localhost:3000} MODE= WAIT=
while [ $# -gt 0 ]; do
  case $1 in
    --artwork) ARTWORK=$2; shift 2 ;;
    --condition) CONDITION=$2; shift 2 ;;
    --nonce) NONCE=$2; shift 2 ;;
    --relayer) RELAYER=$2; shift 2 ;;
    --enclave-url) URL=$2; shift 2 ;;
    --wait) WAIT=1; shift ;;
    --dry-run) MODE=--dry-run; shift ;;
    *) echo "unknown argument $1" >&2; exit 2 ;;
  esac
done
[ -n "$ARTWORK" ] || { echo "--artwork is required" >&2; exit 2; }
SOURCE=$(channel/device.py address "$DEVICE")
mkdir -p logs/reports

post() {  # post <path> <json>
  local out
  out=$(curl -sS -X POST "$URL$1" -H 'content-type: application/json' -d "$2")
  if [ "$(jq -r '.error // empty' <<<"$out")" != "" ]; then
    echo "enclave refused: $(jq -r .error <<<"$out")" >&2
    return 1
  fi
  printf '%s' "$out"
}

case $PHASE in
  read)
    [ -n "$CONDITION" ] || { echo "--condition is required" >&2; exit 2; }
    # 1. The device signs. Nothing here touches the chain.
    READING=$(channel/device.py sign "$DEVICE" --artwork "$ARTWORK" --condition "$CONDITION" ${NONCE:+--nonce "$NONCE"})
    # 2. The enclave authenticates and files it.
    ACCEPTED=$(post /process_data "$READING")
    echo "== reading of $DEVICE ($SOURCE) filed: $(jq -c '{readings, opened_at, closes_at}' <<<"$ACCEPTED")"
    echo "   window closes at $(date -d @$(( $(jq -r .closes_at <<<"$ACCEPTED") / 1000 )) '+%H:%M:%S')"
    ;;

  close)
    PKG=$(jq -r .latestPackageId $D)
    REG_S=$(jq -r .sourceRegistry $D)
    POLICY=$(jq -r .channelPolicy $D)
    CONFIG=$(jq -r .enclaveConfig $D)
    ENCLAVE=$(jq -r '.enclave // empty' $D)
    [ -n "$ENCLAVE" ] || { echo "deployment.testnet.json has no 'enclave' object id: run enclave/enclave-setup.sh record first" >&2; exit 1; }
    CLOCK=0x6
    REQUEST=$(jq -n --arg s "$SOURCE" --arg a "$ARTWORK" '{payload:{source:$s, artwork:$a}}')

    # 3. The enclave closes the window and signs one report for it.
    if [ -n "$WAIT" ]; then
      until VERDICT=$(post /close_window "$REQUEST" 2>/dev/null); do sleep 5; done
    else
      VERDICT=$(post /close_window "$REQUEST")
    fi
    STAMP=$(jq -r .report.response.timestamp_ms <<<"$VERDICT")
    OUT=logs/reports/$STAMP-$DEVICE.json
    printf '%s\n' "$VERDICT" > "$OUT"
    echo "== enclave closed the window at $STAMP: $(jq -c '{readings:.report.response.data.readings, condition:.report.response.data.condition}' <<<"$VERDICT")"
    echo "   report saved in $OUT"

    eval "$(python3 - "$VERDICT" <<'PY'
import json, sys
v = json.loads(sys.argv[1])["report"]
r = v["response"]; d = r["data"]
tohex = lambda b: "0x" + bytes(b).hex()
sig = bytes.fromhex(v["signature"])
print(f"P_ARTWORK={tohex(d['artwork'])}")
print(f"P_SOURCE={tohex(d['source'])}")
print(f"P_CONDITION={d['condition']}")
print(f"P_READINGS={d['readings']}")
print(f"P_ATTESTED={r['timestamp_ms']}")
print("P_SIG='vector[" + ", ".join(f"{b}u8" for b in sig) + "]'")
PY
)"

    CUSTODY=$(sui client dynamic-field "$P_ARTWORK" --json | jq -r '.data[] | select(.objectType|endswith("::custody::CustodyRecord")) | .objectId' | head -1)
    [ -n "$CUSTODY" ] || { echo "no custody record on $P_ARTWORK: the work was never taken into custody" >&2; exit 1; }
    LOG_ID=$(sui client object "$CUSTODY" --json | jq -r '.content.fields.report_log')
    [[ "$LOG_ID" =~ ^0x[0-9a-f]{64}$ ]] || { echo "could not read report_log from $CUSTODY" >&2; exit 1; }
    CHANNEL_STATS=$(jq -r .channelStats $D)
    echo "== report log $LOG_ID, channel counters $CHANNEL_STATS"

    # 4. The relayer submits. Switch to it for this one transaction and switch back.
    PREVIOUS=$(sui client active-address)
    sui client switch --address "$RELAYER" >/dev/null
    trap 'sui client switch --address "$PREVIOUS" >/dev/null' EXIT
    echo "== relayer $RELAYER ($(sui client active-address)) submits record_report"

    LOG=logs/submit-report.testnet.log
    [ -f "$LOG" ] && cp "$LOG" "$LOG.prev"
    sui client ptb $MODE \
      --move-call "$PKG::report::record_report" @"$P_ARTWORK" @"$LOG_ID" @"$CHANNEL_STATS" @"$REG_S" @"$POLICY" @"$CONFIG" @"$ENCLAVE" @"$P_SOURCE" "$P_CONDITION" "$P_READINGS" "$P_ATTESTED" "$P_SIG" @"$CLOCK" \
      --gas-budget 50000000 2>&1 | tee "$LOG" | { grep -E "Transaction Digest|execution status|^│ Status|^Error|error" || true; }
    rc=${PIPESTATUS[0]}
    if [ "$rc" -ne 0 ] || grep -qE "Status: Failure|^Error" "$LOG"; then
      echo "transaction failed, see $LOG" >&2
      exit 1
    fi
    DIGEST=$(grep -oE "Transaction Digest: [A-Za-z0-9]+" "$LOG" | head -1 | awk '{print $3}')
    [ -n "$DIGEST" ] && jq --arg d "$DIGEST" '.digest = $d' "$OUT" > "$OUT.tmp" && mv "$OUT.tmp" "$OUT" && echo "== recorded, digest $DIGEST"
    ;;

  *) echo "unknown phase $PHASE (read|close)" >&2; exit 2 ;;
esac
