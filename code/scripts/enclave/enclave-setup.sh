#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."   # the scripts root: deployment.testnet.json lives here
D=deployment.testnet.json
STEP=${1:?usage: $0 config|measure|pcrs|register|record|accept|endpoint <url>|window <ms> [--dry-run]}
MODE=${2:-}
case $STEP in
  window) WINDOW=${2:?usage: $0 window <ms>}; MODE=${3:-} ;;
  endpoint) ENDPOINT=${2:?usage: $0 endpoint <url>}; MODE=${3:-} ;;
esac
URL=${ENCLAVE_URL:-http://localhost:3000}
CLOCK=0x6

AUTHORITY=$(jq -r .authority $D)
CAP=$(jq -r .adminCap $D)
active=$(sui client active-address)
if [ "$active" != "$AUTHORITY" ]; then
  echo "active address is $active, expected the authority $AUTHORITY" >&2
  echo "run: sui client switch --address authority" >&2
  exit 1
fi

run() {
  local log=$1; shift
  [ -f "$log" ] && cp "$log" "$log.prev"
  if [ -n "$MODE" ]; then
    sui client ptb $MODE "$@" 2>&1 | tee "$log"
    return 0
  fi
  sui client ptb "$@" > "$log" 2>&1 || { echo "transaction failed, see $log" >&2; tail -20 "$log" >&2; exit 1; }
  DIGEST=$(grep -oE "Transaction Digest: [A-Za-z0-9]+" "$log" | head -1 | awk '{print $3}')
  echo "digest $DIGEST, $(grep -oE "Status: [A-Za-z]+" "$log" | head -1)"
  grep -q "Status: Success" "$log" || { echo "transaction did not succeed, see $log" >&2; exit 1; }
}

created() {
  awk -v want="$1" '
    /Created Objects:/ {inblock=1; next}
    /Mutated Objects:|Gas Object:|Deleted Objects:/ {inblock=0}
    inblock && /ID: 0x/ {id=$0; sub(/.*ID: /,"",id); sub(/ .*/,"",id)}
    inblock && /Owner:/ && index($0, want) {print id}
  ' "$LOG_FOR_CREATED"
}

save() {  # save key value
  jq --arg k "$1" --arg v "$2" '.[$k] = $v' "$D" > "$D.tmp" && mv "$D.tmp" "$D"
  echo "recorded $1 = $2"
}

# `vector[1u8, 2u8, ...]` from hex, the form the PTB CLI takes for vector<u8>.
u8vec() {
  python3 -c "import sys; h=sys.argv[1]; print('vector[' + ', '.join(f'{int(h[i:i+2],16)}u8' for i in range(0,len(h),2)) + ']')" "$1"
}

case $STEP in
  config)
    PKG=$(jq -r .latestPackageId $D)
    P0=$(jq -r '.enclavePcrs.PCR0 // empty' $D)
    P1=$(jq -r '.enclavePcrs.PCR1 // empty' $D)
    P2=$(jq -r '.enclavePcrs.PCR2 // empty' $D)
    [ -n "$P0" ] && [ -n "$P1" ] && [ -n "$P2" ] || {
      echo "no measurements recorded: build the image and run '$0 measure' first" >&2; exit 1; }
    LOCAL=$(awk '/PCR0/{print $1}' ../enclave/out/nitro.pcrs 2>/dev/null || true)
    if [ -n "$LOCAL" ] && [ "$LOCAL" != "$P0" ]; then
      echo "the recorded PCR0 is not the local image's:" >&2
      echo "  recorded $P0" >&2
      echo "  local    $LOCAL" >&2
      echo "run '$0 measure' first, or rebuild the image" >&2
      exit 1
    fi
    POLICY=$(jq -r '.channelPolicy // empty' $D)
    [ -n "$POLICY" ] || { echo "channelPolicy is not recorded; run record-publish.sh first" >&2; exit 1; }
    echo "== create_config on package $PKG, policy $POLICY"
    echo "   PCR0 $P0"; echo "   PCR1 $P1"; echo "   PCR2 $P2"
    run logs/enclave-config.testnet.log \
      --move-call "$PKG::report::create_config" @$POLICY @$CAP "$(u8vec $P0)" "$(u8vec $P1)" "$(u8vec $P2)"
    [ -n "$MODE" ] && exit 0
    LOG_FOR_CREATED=logs/enclave-config.testnet.log
    save reportPackageId "$PKG"
    save enclaveConfig "$(created 'Shared' | head -1)"
    save enclaveCap "$(created 'Account Address' | head -1)"
    jq --arg d "$DIGEST" --arg p0 "$P0" '.enclaveSetupDigests.config = $d | .enclaveSetupDigests.pcrsFor = $p0' "$D" > "$D.tmp" && mv "$D.tmp" "$D"
    CONFIG=../frontend/src/config.ts
    sed -i -E "s|(\bconfigId: ')0x[0-9a-f]+(')|\1$(jq -r .enclaveConfig $D)\2|" $CONFIG
    sed -i -E "s|(\bcapId: ')0x[0-9a-f]+(')|\1$(jq -r .enclaveCap $D)\2|" $CONFIG
    grep -qE "configId: '$(jq -r .enclaveConfig $D)'" $CONFIG && echo "patched $CONFIG (enclave.configId, capId)"
    ;;

  pcrs)
    PKG=$(jq -r .reportPackageId $D)
    CONFIG=$(jq -r '.enclaveConfig // empty' $D); ECAP=$(jq -r '.enclaveCap // empty' $D)
    [ -n "$CONFIG" ] && [ -n "$ECAP" ] || { echo "run '$0 config' first" >&2; exit 1; }
    P0=$(jq -r .enclavePcrs.PCR0 $D); P1=$(jq -r .enclavePcrs.PCR1 $D); P2=$(jq -r .enclavePcrs.PCR2 $D)
    echo "== update_pcrs on config $CONFIG"
    echo "   PCR0 $P0"; echo "   PCR1 $P1"; echo "   PCR2 $P2"
    run logs/enclave-pcrs.testnet.log \
      --move-call "$PKG::enclave::update_pcrs" "<$PKG::report::ReportChannel>" @$CONFIG @$ECAP "$(u8vec $P0)" "$(u8vec $P1)" "$(u8vec $P2)"
    [ -n "$MODE" ] && exit 0
    jq --arg d "$DIGEST" --arg p0 "$P0" '.enclaveSetupDigests.pcrs = $d | .enclaveSetupDigests.pcrsFor = $p0' "$D" > "$D.tmp" && mv "$D.tmp" "$D"
    ;;

  measure)
    EIF=../enclave/out/nitro.eif; PCRS=../enclave/out/nitro.pcrs
    [ -s "$EIF" ] && [ -s "$PCRS" ] || { echo "no image in ../enclave/out: run 'make ENCLAVE_APP=art-tokenization' in ../enclave first" >&2; exit 1; }
    P0=$(awk '/PCR0/{print $1}' "$PCRS"); P1=$(awk '/PCR1/{print $1}' "$PCRS"); P2=$(awk '/PCR2/{print $1}' "$PCRS")
    SHA=$(sha256sum "$EIF" | cut -d' ' -f1); BYTES=$(stat -c %s "$EIF")
    jq --arg p0 "$P0" --arg p1 "$P1" --arg p2 "$P2" --arg sha "$SHA" --argjson b "$BYTES" --arg at "$(date -u +%Y-%m-%dT%H:%M:%S)" \
      '.enclavePcrs = {builtAt:$at, eifSha256:$sha, eifBytes:$b, PCR0:$p0, PCR1:$p1, PCR2:$p2}' "$D" > "$D.tmp" && mv "$D.tmp" "$D"
    echo "recorded enclavePcrs: PCR0 $P0"; echo "  sha256 $SHA ($BYTES bytes)"
    ;;

  register)
    PKG=$(jq -r .reportPackageId $D)
    CONFIG=$(jq -r '.enclaveConfig // empty' $D)
    [ -n "$CONFIG" ] || { echo "run '$0 config' first" >&2; exit 1; }
    echo "== fetching the attestation from $URL"
    PK=$(curl -sS "$URL/health_check" | jq -r .pk)
    ATT=$(curl -sS "$URL/get_attestation" | jq -r .attestation)
    [ -n "$ATT" ] && [ "$ATT" != null ] || { echo "empty attestation from $URL/get_attestation" >&2; exit 1; }
    echo "   enclave public key $PK, attestation ${#ATT} hex chars"
    run logs/enclave-register.testnet.log \
      --assign v "$(u8vec $ATT)" \
      --move-call "0x2::nitro_attestation::load_nitro_attestation" v @$CLOCK \
      --assign doc \
      --move-call "$PKG::enclave::register_enclave" "<$PKG::report::ReportChannel>" @$CONFIG doc \
      --gas-budget 100000000
    [ -n "$MODE" ] && exit 0
    LOG_FOR_CREATED=logs/enclave-register.testnet.log
    save enclave "$(created 'Shared' | head -1)"
    save enclavePk "$PK"
    ;;

  record)
    STATUS=$(curl -sS "$URL/status")
    ENC=$(jq -r '.enclave_object // empty' <<<"$STATUS"); PK=$(jq -r .public_key <<<"$STATUS")
    [ -n "$ENC" ] || { echo "the enclave has not registered itself yet: $(jq -c '{address, pending:(.pending|length)}' <<<"$STATUS")" >&2; exit 1; }
    save enclave "$ENC"
    save enclavePk "$PK"
    save enclaveAddress "$(jq -r .enclave_address <<<"$STATUS")"
    save enclavePayer "$(jq -r '.payer + " " + .address' <<<"$STATUS")"
    save enclaveRegisteredBy "$(jq -r .registered_by <<<"$STATUS")"
    ;;

  accept)
    PKG=$(jq -r .latestPackageId $D)
    POLICY=$(jq -r '.channelPolicy // empty' $D)
    CONFIG=$(jq -r '.enclaveConfig // empty' $D)
    ENCLAVE=$(jq -r '.enclave // empty' $D)
    [ -n "$POLICY" ] && [ -n "$CONFIG" ] || { echo "run 'config' and record-publish.sh first" >&2; exit 1; }
    [ -n "$ENCLAVE" ] || { echo "no enclave object recorded: run '$0 record' after the enclave registered" >&2; exit 1; }
    echo "== accept_enclave $ENCLAVE on policy $POLICY"
    run logs/enclave-accept.testnet.log \
      --move-call "$PKG::report::accept_enclave" @$POLICY @$CAP @$ENCLAVE @$CONFIG @$CLOCK
    [ -n "$MODE" ] && exit 0
    jq --arg d "$DIGEST" --arg e "$ENCLAVE" '.acceptedEnclave = $e | .enclaveSetupDigests.accept = $d' "$D" > "$D.tmp" && mv "$D.tmp" "$D"
    echo "recorded acceptedEnclave = $ENCLAVE"
    ;;

  endpoint)
    PKG=$(jq -r .latestPackageId $D)
    POLICY=$(jq -r '.channelPolicy // empty' $D)
    [ -n "$POLICY" ] || { echo "channelPolicy is not recorded; run record-publish.sh first" >&2; exit 1; }
    echo "== set_endpoint $ENDPOINT on policy $POLICY"
    run logs/enclave-endpoint.testnet.log \
      --move-call "$PKG::report::set_endpoint" @$POLICY @$CAP "\"$ENDPOINT\"" @$CLOCK
    [ -n "$MODE" ] && exit 0
    jq --arg d "$DIGEST" --arg u "$ENDPOINT" '.channelEndpoint = $u | .enclaveSetupDigests.endpoint = $d' "$D" > "$D.tmp" && mv "$D.tmp" "$D"
    echo "recorded channelEndpoint = $ENDPOINT"
    ;;

  window)
    PKG=$(jq -r .latestPackageId $D)
    POLICY=$(jq -r '.channelPolicy // empty' $D)
    [ -n "$POLICY" ] || { echo "channelPolicy is not recorded; run record-publish.sh first" >&2; exit 1; }
    echo "== set_window_ms $WINDOW on policy $POLICY"
    run logs/enclave-window.testnet.log \
      --move-call "$PKG::report::set_window_ms" @$POLICY @$CAP "$WINDOW" @$CLOCK
    [ -n "$MODE" ] && exit 0
    jq --arg d "$DIGEST" --arg w "$WINDOW" '.windowMs = ($w|tonumber) | .enclaveSetupDigests.window = ((.enclaveSetupDigests.window // []) + [$d])' "$D" > "$D.tmp" && mv "$D.tmp" "$D"
    ;;

  *) echo "unknown step $STEP (config|measure|pcrs|register|record|accept|endpoint|window)" >&2; exit 2 ;;
esac
