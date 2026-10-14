#!/usr/bin/env bash
set -euo pipefail
DOMAIN=${DOMAIN:?DOMAIN is required, e.g. art-tokenization.duckdns.org}
cd "$(dirname "$0")"
if ! command -v docker >/dev/null; then
  sudo dnf install -y docker
  sudo systemctl enable --now docker
  sudo usermod -aG docker ec2-user
fi
if ! docker compose version >/dev/null 2>&1; then
  sudo mkdir -p /usr/local/lib/docker/cli-plugins
  sudo curl -sSL "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-$(uname -m)" \
    -o /usr/local/lib/docker/cli-plugins/docker-compose
  sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
fi
echo "DOMAIN=$DOMAIN" > .env
sudo docker compose up -d
sleep 5
sudo docker compose ps
echo "portal up; first https request to https://$DOMAIN issues the certificate"
