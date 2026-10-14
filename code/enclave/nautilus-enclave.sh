#!/bin/bash
set -euo pipefail

HOME_DIR=/home/ec2-user
EIF="$HOME_DIR/nitro.eif"
SECRETS="$HOME_DIR/secrets.json"
CPUS=2
MEMORY=1024

cd "$HOME_DIR"

enclave_id() { nitro-cli describe-enclaves | jq -r '.[0].EnclaveID // empty'; }
enclave_cid() { nitro-cli describe-enclaves | jq -r '.[0].EnclaveCID // empty'; }

sh host-egress.sh

fresh=0
if [ -z "$(enclave_id)" ]; then
    echo "εκκίνηση θαλάμου από $EIF"
    nitro-cli run-enclave --cpu-count "$CPUS" --memory "$MEMORY" --eif-path "$EIF"
    fresh=1
else
    echo "ο θάλαμος τρέχει ήδη: $(enclave_id)"
fi

CID=$(enclave_cid)
[ -n "$CID" ] || { echo "δεν βρέθηκε CID θαλάμου" >&2; exit 1; }

if [ "$fresh" = 1 ]; then
    sleep 5
    socat - "VSOCK-CONNECT:$CID:7777" < "$SECRETS"
fi

echo "γέφυρα 127.0.0.1:3000 -> vsock $CID:3000"
exec socat TCP4-LISTEN:3000,bind=127.0.0.1,reuseaddr,fork "VSOCK-CONNECT:$CID:3000"
