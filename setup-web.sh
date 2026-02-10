#!/bin/bash
# Security Camera Web Server Setup
# Configures nginx and enables the web interface
# Run after setup-first-time.sh

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}Security Camera - Web Server Setup (Stills-Only)${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════${NC}"
echo ""

# Check root
if [[ $EUID -ne 0 ]]; then
   echo -e "${RED}Error: This script must be run as root${NC}"
   echo "Usage: sudo ./setup-web.sh"
   exit 1
fi

# Create nginx configuration for web interface
echo -e "${YELLOW}Configuring nginx...${NC}"

sudo tee /etc/nginx/sites-available/security-cam > /dev/null << EOF
server {
    listen 80;
    server_name _;

    # Web interface
    location / {
        root $(pwd)/web;
        index index.html;
        try_files \$uri \$uri/ =404;
    }

    # API proxy
    location /api/ {
        proxy_pass http://localhost:5000/api/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    }
}
EOF

echo -e "${GREEN}✓ Nginx configuration created${NC}"
echo ""

# Enable nginx site
echo -e "${YELLOW}Enabling nginx site...${NC}"
sudo rm -f /etc/nginx/sites-enabled/default /etc/nginx/sites-enabled/camcon
sudo ln -sf /etc/nginx/sites-available/security-cam /etc/nginx/sites-enabled/

echo -e "${YELLOW}Testing and starting nginx...${NC}"
sudo nginx -t && sudo systemctl enable nginx && sudo systemctl restart nginx

echo -e "${GREEN}✓ Nginx configured and restarted${NC}"
echo ""

echo -e "${GREEN}════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}Web server setup complete!${NC}"
echo -e "${GREEN}════════════════════════════════════════════════════${NC}"
echo ""
echo "Access the web interface at:"
PI_IP=$(hostname -I | awk '{print $1}')
echo "  http://$PI_IP"
echo ""
echo "Nginx status:"
sudo systemctl status nginx --no-pager || echo "Nginx may still be starting..."
echo ""
