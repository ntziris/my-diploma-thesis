#!/bin/bash
set -euo pipefail
HOST=graphql.testnet.sui.io
PORT=8101
CONF=/etc/nitro_enclaves/vsock-proxy.yaml
grep -q "$HOST" $CONF 2>/dev/null || echo "- {address: $HOST, port: 443}" | sudo tee -a $CONF
LOG=/tmp/vsock-proxy-$PORT.log
pgrep -x vsock-proxy -a | grep -q " $PORT " \
  || (setsid nohup vsock-proxy $PORT $HOST 443 --config $CONF > $LOG 2>&1 < /dev/null &)
sleep 2
if pgrep -x vsock-proxy -a | grep " $PORT "; then
  echo "egress to $HOST is up on vsock port $PORT"
else
  echo "vsock-proxy did not start; $LOG says:" >&2; tail -5 $LOG >&2; exit 1
fi
