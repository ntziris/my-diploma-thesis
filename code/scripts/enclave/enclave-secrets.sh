#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."   # the scripts root: deployment.testnet.json lives here
IP=${1:?usage: $0 <instance-ip> [payer-alias|none]}
PAYER=${2:-enclave-payer}
D=deployment.testnet.json
TMP=$(mktemp); chmod 600 "$TMP"; trap 'rm -f "$TMP"' EXIT

python3 - "$D" "$PAYER" > "$TMP" <<'PY'
import json, sys, base64, pathlib
sys.path.insert(0, "channel")
from suibcs import sui_address
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat
d = json.load(open(sys.argv[1])); alias = sys.argv[2]
secrets = {
    "GRAPHQL_URL": "https://graphql.testnet.sui.io/graphql",
    "PACKAGE_ID": d["reportPackageId"],
    "ORIGINAL_PACKAGE_ID": d["packageId"],
    "SOURCE_REGISTRY": d["sourceRegistry"],
    "ENCLAVE_CONFIG": d["enclaveConfig"],
}
secrets["CHANNEL_POLICY"] = d["channelPolicy"]
secrets["CHANNEL_STATS"] = d["channelStats"]
if alias != "none":
    want = d["addresses"][alias]
    for k in json.load(open(pathlib.Path.home() / ".sui/sui_config/sui.keystore")):
        raw = base64.b64decode(k)
        if raw[0] != 0:
            continue
        seed = raw[1:33]
        pk = Ed25519PrivateKey.from_private_bytes(seed).public_key().public_bytes(Encoding.Raw, PublicFormat.Raw)
        if sui_address(pk) == want:
            secrets["PAYER_KEY_SEED_HEX"] = seed.hex()
            break
    else:
        sys.exit(f"no ed25519 key for alias {alias} ({want}) in the local keystore")
    print(json.dumps({k: (v if k != "PAYER_KEY_SEED_HEX" else "<redacted>") for k, v in secrets.items()}, indent=2), file=sys.stderr)
json.dump(secrets, sys.stdout)
PY

scp -q -i ~/.ssh/nautilus-key.pem "$TMP" "ec2-user@$IP:~/secrets.json"
ssh -i ~/.ssh/nautilus-key.pem "ec2-user@$IP" 'chmod 600 ~/secrets.json && echo "secrets.json in place ($(wc -c < ~/secrets.json) bytes)"'
[ "$PAYER" = none ] || echo "payer: $PAYER ($(jq -r --arg a "$PAYER" '.addresses[$a]' $D)); keep it funded, it pays every report"
