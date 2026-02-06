#!/bin/bash

# Configure wlan0 to use the same 192.168.4.x network as eth0
# Uses DHCP to get an IP from the same network

echo "========================================"
echo "WiFi Network Configuration (192.168.4.x)"
echo "========================================"
echo ""

# Check if wlan0 exists
if ! ip link show wlan0 >/dev/null 2>&1; then
    echo "Error: wlan0 interface not found!"
    exit 1
fi

echo "Configuring wlan0 for 192.168.4.x network..."
echo ""

# Get the current SSID
read -p "Enter WiFi SSID: " SSID

# Get the password
read -sp "Enter WiFi Password: " PSK
echo ""

# First, delete any existing connection for wlan0
echo "Removing old wlan0 connections..."
for uuid in $(sudo nmcli -t -f NAME,UUID connection show | grep wlan0 | cut -d: -f2); do
    sudo nmcli connection delete uuid "$uuid" 2>/dev/null
done

echo ""
echo "Creating new WiFi connection..."
sudo nmcli connection add \
    type wifi \
    ifname wlan0 \
    con-name "wlan0-192.168.4" \
    ssid "$SSID" \
    wifi-sec.key-mgmt wpa-psk \
    wifi-sec.psk "$PSK" \
    ipv4.method auto \
    autoconnect yes

echo ""
echo "Bringing up wlan0..."
sudo nmcli connection up "wlan0-192.168.4"

sleep 3

echo ""
echo "========================================"
echo "Connection Status"
echo "========================================"
echo ""

ip addr show eth0 | grep "inet " | awk '{print "eth0:  " $2}'
ip addr show wlan0 | grep "inet " | awk '{print "wlan0: " $2}'

echo ""
echo "✓ WiFi configuration complete!"
echo ""
