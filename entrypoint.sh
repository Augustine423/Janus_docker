#!/bin/bash
set -e

# Auto-detect public IP
PUBLIC_IP=localhost
echo "Using PUBLIC_IP: $PUBLIC_IP"

# Start nginx as a daemon (background)
nginx

# Start janus in foreground
exec /opt/janus/bin/janus --nat-1-1="$PUBLIC_IP" -d 5
