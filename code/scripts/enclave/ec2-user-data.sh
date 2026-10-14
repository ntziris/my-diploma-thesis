#!/bin/bash

set -euxo pipefail

yum update -y
yum install -y aws-nitro-enclaves-cli-devel aws-nitro-enclaves-cli docker nano socat git make

# ec2-user runs docker and nitro-cli without sudo
usermod -aG docker ec2-user
usermod -aG ne ec2-user

systemctl start nitro-enclaves-allocator.service
systemctl enable nitro-enclaves-allocator.service
systemctl start docker
systemctl enable docker
systemctl enable nitro-enclaves-vsock-proxy.service

systemctl stop nitro-enclaves-allocator.service
sed -r 's/^(\s*memory_mib\s*:\s*).*/\13072/' -i /etc/nitro_enclaves/allocator.yaml
systemctl start nitro-enclaves-allocator.service
systemctl enable nitro-enclaves-allocator.service

echo "- {address: graphql.testnet.sui.io, port: 443}" >> /etc/nitro_enclaves/vsock-proxy.yaml
nohup vsock-proxy 8101 graphql.testnet.sui.io 443 --config /etc/nitro_enclaves/vsock-proxy.yaml > /var/log/vsock-proxy-8101.log 2>&1 &
