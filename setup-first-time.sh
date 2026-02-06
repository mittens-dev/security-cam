#!/bin/bash
# Security Camera First-Time Setup
# Installs dependencies and configures the system
# Run once after cloning the repo

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}Security Camera - First-Time Setup${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════${NC}"
echo ""

# Check root
if [[ $EUID -ne 0 ]]; then
   echo -e "${RED}Error: This script must be run as root${NC}"
   echo "Usage: sudo ./setup-first-time.sh"
   exit 1
fi

# Check if running on Raspberry Pi
if [ ! -f /proc/device-tree/model ] || ! grep -q "Raspberry Pi" /proc/device-tree/model; then
    echo -e "${YELLOW}Warning: This script is designed for Raspberry Pi${NC}"
fi

# Update system
echo ""
echo -e "${YELLOW}Updating system packages...${NC}"
sudo apt update && sudo apt upgrade -y
echo -e "${GREEN}✓ System updated${NC}"
echo ""

# Install system dependencies
echo -e "${YELLOW}Installing system dependencies...${NC}"
sudo apt install -y python3-pip python3-opencv python3-flask python3-flask-cors python3-picamera2 libcamera-dev python3-libcamera nginx ffmpeg avahi-daemon
echo -e "${GREEN}✓ Dependencies installed${NC}"
echo ""

# Setup hostname for mDNS
echo -e "${YELLOW}Configuring hostname for network discovery...${NC}"
read -p "Enter a unique hostname for this device (e.g., security-cam-pi4 or security-cam-zero): " HOSTNAME
if [ -n "$HOSTNAME" ]; then
    sudo hostnamectl set-hostname "$HOSTNAME"
    sudo sed -i "s/127.0.1.1.*/127.0.1.1 $HOSTNAME/" /etc/hosts
    echo -e "${GREEN}✓ Hostname set to: $HOSTNAME${NC}"
else
    echo -e "${YELLOW}Using default hostname${NC}"
fi
echo ""

# Enable mDNS service
echo -e "${YELLOW}Enabling mDNS (Avahi) for hostname discovery...${NC}"
sudo systemctl enable avahi-daemon
sudo systemctl restart avahi-daemon
echo -e "${GREEN}✓ mDNS enabled - device accessible at: $(hostname).local${NC}"
echo ""

# Enable camera
echo -e "${YELLOW}Configuring camera...${NC}"
if ! grep -q "^start_x=1" /boot/config.txt 2>/dev/null; then
    echo "start_x=1" | sudo tee -a /boot/config.txt
fi
if ! grep -q "^gpu_mem=" /boot/config.txt 2>/dev/null; then
    echo "gpu_mem=128" | sudo tee -a /boot/config.txt
fi
echo -e "${GREEN}✓ Camera enabled${NC}"
echo ""

# Set permissions for directories
echo -e "${YELLOW}Setting up directories...${NC}"
mkdir -p recordings logs stills
chmod 755 recordings logs stills
chmod +x api/security-api.py
echo -e "${GREEN}✓ Directories created${NC}"
echo ""

echo -e "${GREEN}════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}First-time setup complete!${NC}"
echo -e "${GREEN}════════════════════════════════════════════════════${NC}"
echo ""
echo "Next steps:"
echo "  1. Run: sudo ./setup-api.sh"
echo "  2. Run: sudo ./setup-web.sh"
echo "  3. Reboot for camera changes: sudo reboot"
echo ""
