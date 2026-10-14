# Copyright (c), Mysten Labs, Inc.
# SPDX-License-Identifier: Apache-2.0
#!/bin/bash

# Gets the enclave id and CID
# expects there to be only one enclave running
ENCLAVE_ID=$(nitro-cli describe-enclaves | jq -r ".[0].EnclaveID")
ENCLAVE_CID=$(nitro-cli describe-enclaves | jq -r ".[0].EnclaveCID")

sleep 5
# Hand the secrets to the enclave.
cat secrets.json | socat - VSOCK-CONNECT:$ENCLAVE_CID:7777
# Loopback only: the reverse proxy on this host exposes POST /process_data and nothing else.
socat TCP4-LISTEN:3000,bind=127.0.0.1,reuseaddr,fork VSOCK-CONNECT:$ENCLAVE_CID:3000 &

