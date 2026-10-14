#!/usr/bin/env bash
# Usage: ./ingress.sh up <ip> <domain>   install and start the proxy (Caddy in Docker)
# Usage: ./ingress.sh status <ip>        is it running, and what does it answer
# Usage: ./ingress.sh logs <ip>          the last lines of its log
# Usage: ./ingress.sh down <ip>          stop and remove it
set -euo pipefail
cd "$(dirname "$0")/.."   # the scripts root: deployment.testnet.json lives here
D=deployment.testnet.json
KEY=${SSH_KEY:-~/.ssh/nautilus-key.pem}
NAME=channel-caddy

STEP=${1:?usage: $0 up|status|logs|down <ip> [domain]}
IP=${2:-$(jq -r '.instance.ip // empty' $D)}
[ -n "$IP" ] || { echo "no instance ip: pass it, or record it in $D" >&2; exit 1; }
SSH="ssh -o StrictHostKeyChecking=accept-new -i $KEY ec2-user@$IP"

case $STEP in
  up)
    DOMAIN=${3:-$(jq -r '.channelDomain // empty' $D)}
    [ -n "$DOMAIN" ] || { echo "usage: $0 up <ip> <domain>" >&2; exit 1; }
    echo "== $DOMAIN -> $IP -> enclave on 127.0.0.1:3000"

    resolved=$(getent hosts "$DOMAIN" | awk '{print $1}' | head -1 || true)
    if [ "$resolved" != "$IP" ]; then
      echo "$DOMAIN resolves to '${resolved:-nothing}', not to $IP" >&2
      echo "point the record at the instance first (DuckDNS: curl \"https://www.duckdns.org/update?domains=<name>&token=<token>&ip=$IP\")" >&2
      exit 1
    fi

    scp -q -i "$KEY" ../enclave/ingress/Caddyfile "ec2-user@$IP:~/Caddyfile"
    $SSH "sudo mkdir -p /var/log/caddy && docker rm -f $NAME >/dev/null 2>&1 || true; \
      docker run -d --name $NAME --restart unless-stopped --network host \
        -e CHANNEL_DOMAIN=$DOMAIN \
        -v /home/ec2-user/Caddyfile:/etc/caddy/Caddyfile:ro \
        -v caddy_data:/data -v caddy_config:/config \
        -v /var/log/caddy:/var/log/caddy \
        caddy:2-alpine >/dev/null && echo started"
    jq --arg d "$DOMAIN" --arg ip "$IP" '.channelDomain = $d | .instance = ((.instance // {}) + {ip: $ip})' $D > $D.tmp && mv $D.tmp $D
    echo "recorded channelDomain = $DOMAIN"
    echo "== certificate (first issue takes a few seconds)"
    sleep 8
    curl -s -o /dev/null -w "   GET  https://$DOMAIN -> %{http_code} (404 is correct: only POST /process_data is served)\n" "https://$DOMAIN/" || true
    echo
    echo "Publish it so devices can find it, then they need nothing else:"
    echo "  enclave/enclave-setup.sh endpoint https://$DOMAIN"
    ;;

  status)
    $SSH "docker ps --filter name=$NAME --format '{{.Status}}' || true"
    DOMAIN=$(jq -r '.channelDomain // empty' $D)
    [ -n "$DOMAIN" ] && curl -s -o /dev/null -w "https://$DOMAIN -> %{http_code}\n" "https://$DOMAIN/" || true
    ;;

  logs)
    $SSH "docker logs --tail 40 $NAME 2>&1"
    ;;

  down)
    $SSH "docker rm -f $NAME >/dev/null && echo removed"
    ;;

  *) echo "unknown step $STEP (up|status|logs|down)" >&2; exit 2 ;;
esac
