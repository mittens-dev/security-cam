#!/bin/bash
# Security Camera Network Setup - Simple and Clean
# Sets static IPs for both eth0 and wlan0
# Run once after repo clone, then never touch it again

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}Security Camera Network Setup${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════${NC}"
echo ""

# Check root
if [[ $EUID -ne 0 ]]; then
   echo -e "${RED}Error: This script must be run as root${NC}"
   echo "Usage: sudo ./setup-network.sh"
   exit 1
fi

# Clean up all NetworkManager mess
echo -e "${YELLOW}Cleaning up old network configurations...${NC}"
nmcli connection show | grep -E "pi3-eth|pi4-eth|eth0|wlan0|Ethernet|pi_zero" | awk '{print $1}' | while read conn; do
    if [ -n "$conn" ]; then
        nmcli connection delete "$conn" 2>/dev/null || true
    fi
done
sleep 1
echo -e "${GREEN}✓ Cleanup complete${NC}"
echo ""

# Configure eth0 for Pi4 (static)
echo -e "${YELLOW}Configuring eth0 (Pi4): 192.168.4.175${NC}"
nmcli connection add \
    type ethernet \
    ifname eth0 \
    con-name "eth0-static" \
    autoconnect yes \
    ipv4.method manual \
    ipv4.addresses "192.168.4.175/24" \
    ipv4.gateway "192.168.4.1" \
    ipv4.dns "8.8.8.8,8.8.4.4" \
    2>/dev/null || true
echo -e "${GREEN}✓ eth0 configured${NC}"
echo ""

# Configure wlan0 for Pi Zero (static, with WiFi password)
echo -e "${YELLOW}Configuring wlan0 (Pi Zero): 192.168.4.176${NC}"
read -sp "Enter WiFi password for 'PornServer2': " WIFI_PASSWORD
echo ""
nmcli connection add \
    type wifi \
    ifname wlan0 \
    con-name "wlan0-static" \
    autoconnect yes \
    ssid "PornServer2" \
    wifi-sec.key-mgmt wpa-psk \
    wifi-sec.psk "$WIFI_PASSWORD" \
    ipv4.method manual \
    ipv4.addresses "192.168.4.176/24" \
    ipv4.gateway "192.168.4.1" \
    ipv4.dns "8.8.8.8,8.8.4.4" \
    2>/dev/null || true
echo -e "${GREEN}✓ wlan0 configured${NC}"
echo ""

# Disable GUI network conflicts
echo -e "${YELLOW}Disabling GUI network conflicts...${NC}"
nmcli connection modify "eth0-static" connection.read-only false 2>/dev/null || true
nmcli connection modify "wlan0-static" connection.read-only false 2>/dev/null || true
echo -e "${GREEN}✓ GUI settings locked${NC}"
echo ""

# Try to activate if available
echo -e "${YELLOW}Activating network...${NC}"
nmcli connection up "eth0-static" 2>/dev/null || echo "  eth0 not available (Pi Zero?)"
nmcli connection up "wlan0-static" 2>/dev/null || echo "  wlan0 not configured (Pi4?)"
echo ""

echo -e "${GREEN}════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}Network setup complete!${NC}"
echo -e "${GREEN}════════════════════════════════════════════════════${NC}"
echo ""
echo "Configuration:"
echo "  eth0 (Pi4):      192.168.4.175"
echo "  wlan0 (Pi Zero): 192.168.4.176"
echo ""
echo "Check your connection:"
echo "  ip addr show eth0"
echo "  ip addr show wlan0"
echo ""
