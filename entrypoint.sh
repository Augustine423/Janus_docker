#!/bin/bash
set -e

# Auto-detect public IP
PUBLIC_IP=127.0.0.1
echo "Using PUBLIC_IP: $PUBLIC_IP"

# Start Janus in the background
/opt/janus/bin/janus --nat-1-1="$PUBLIC_IP" -d 5 &

# Start Nginx in the foreground
nginx -g "daemon off;"

# The container will exit when Nginx exits
