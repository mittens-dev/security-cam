#!/bin/bash
# Security Camera API Setup
# Creates and enables the systemd service
# Run after setup-first-time.sh

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}Security Camera - API Service Setup${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════${NC}"
echo ""

# Check root
if [[ $EUID -ne 0 ]]; then
   echo -e "${RED}Error: This script must be run as root${NC}"
   echo "Usage: sudo ./setup-api.sh"
   exit 1
fi

# Create systemd service file
echo -e "${YELLOW}Creating systemd service...${NC}"
sudo tee /etc/systemd/system/security-cam.service > /dev/null << EOF
[Unit]
Description=Security Camera API
After=network.target

[Service]
Type=simple
User=$(logname)
WorkingDirectory=$(pwd)/api
Environment="PYTHONUNBUFFERED=1"
ExecStart=/usr/bin/python3 $(pwd)/api/security-api.py
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF
echo -e "${GREEN}✓ Service file created${NC}"
echo ""

# Enable and start service
echo -e "${YELLOW}Enabling and starting service...${NC}"
sudo systemctl daemon-reload
sudo systemctl enable security-cam.service
sudo systemctl start security-cam.service

# Give service time to start
sleep 2

echo -e "${GREEN}✓ Service enabled and started${NC}"
echo ""

echo -e "${YELLOW}Setting up daily archiving cron job...${NC}"
CRON_JOB="0 0 * * * curl -s -X POST http://localhost:5000/api/archive > /dev/null 2>&1"
CRON_CMD="(crontab -l 2>/dev/null | grep -v '/api/archive'; echo \"$CRON_JOB\") | crontab -"
sudo -u $(logname) bash -c "$CRON_CMD" 2>/dev/null || echo -e "${YELLOW}Note: Cron job setup may require manual setup${NC}"
echo -e "${GREEN}✓ Daily archiving scheduled for midnight (00:00)${NC}"
echo ""

echo -e "${GREEN}════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}API setup complete!${NC}"
echo -e "${GREEN}════════════════════════════════════════════════════${NC}"
echo ""
echo "Service Status:"
sudo systemctl status security-cam.service --no-pager || echo "Service may still be starting..."
echo ""
echo "Useful commands:"
echo "  sudo systemctl status security-cam   # Check status"
echo "  sudo systemctl restart security-cam  # Restart service"
echo "  sudo systemctl stop security-cam     # Stop service"
echo "  sudo journalctl -u security-cam -f   # View logs"
echo ""
