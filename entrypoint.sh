#!/bin/bash
set -e

# Function to detect public IP
detect_public_ip() {
    # Try to get public IP from different sources
    local ip=""
    ip=$(curl -s --max-time 5 https://ipinfo.io/ip || true)
    if [ -z "$ip" ]; then
        ip=$(curl -s --max-time 5 https://ifconfig.me || true)
    fi
    if [ -z "$ip" ]; then
        ip=$(curl -s --max-time 5 https://api.ipify.org || true)
    fi
    if [ -z "$ip" ]; then
        ip=$(hostname -I | awk '{print $1}' | head -n 1)
    fi
    echo "$ip"
}

# Determine public IP
if [ "$AUTO_PUBLIC_IP" = "true" ] || [ -z "$PUBLIC_IP" ]; then
    PUBLIC_IP=$(detect_public_ip)
    if [ -z "$PUBLIC_IP" ]; then
        echo "Warning: Could not detect public IP automatically, falling back to localhost"
        PUBLIC_IP="localhost"
    fi
fi

echo "Using PUBLIC_IP: $PUBLIC_IP"

# Update Janus configuration with the detected IP
sed -i "s|nat_1_1 =.*|nat_1_1 = \"$PUBLIC_IP\"|g" /opt/janus/etc/janus/janus.jcfg
sed -i "s|#stun_server =.*|stun_server = \"stun.l.google.com\"|g" /opt/janus/etc/janus/janus.jcfg
sed -i "s|#stun_port =.*|stun_port = 19302|g" /opt/janus/etc/janus/janus.jcfg

# Start nginx in background
nginx

# Start Janus in foreground
exec /opt/janus/bin/janus --nat-1-1="$PUBLIC_IP" -d 5