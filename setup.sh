#!/bin/bash
# Security Camera Setup Script
# 
# IMPORTANT: Run network configuration first:
#   sudo ./configure_network.sh
# 
# Then run this script to install dependencies

echo "=================================="
echo "Security Camera Setup"
echo "=================================="

# Check if running on Raspberry Pi
if [ ! -f /proc/device-tree/model ] || ! grep -q "Raspberry Pi" /proc/device-tree/model; then
    echo "Warning: This script is designed for Raspberry Pi"
fi

# Update system
echo ""
echo "Updating system packages..."
sudo apt update && sudo apt upgrade -y

# Install system dependencies
echo ""
echo "Installing system dependencies..."
sudo apt install -y python3-pip python3-opencv python3-flask python3-flask-cors python3-picamera2 libcamera-dev python3-libcamera nginx ffmpeg avahi-daemon

# Setup hostname for mDNS
echo ""
echo "Configuring hostname for network discovery..."
read -p "Enter a unique hostname for this device (e.g., security-cam-pi4 or security-cam-zero): " HOSTNAME
if [ -n "$HOSTNAME" ]; then
    sudo hostnamectl set-hostname "$HOSTNAME"
    sudo sed -i "s/127.0.1.1.*/127.0.1.1 $HOSTNAME/" /etc/hosts
    echo "✓ Hostname set to: $HOSTNAME"
else
    echo "Using default hostname"
fi

# Enable mDNS service
echo ""
echo "Enabling mDNS (Avahi) for hostname discovery..."
sudo systemctl enable avahi-daemon
sudo systemctl restart avahi-daemon
echo "✓ mDNS enabled - device accessible at: $(hostname).local"

# Create systemd service file
echo ""
echo "Creating systemd service..."
sudo tee /etc/systemd/system/security-cam.service > /dev/null << EOF
[Unit]
Description=Security Camera API
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$(pwd)/api
Environment="PYTHONUNBUFFERED=1"
ExecStart=/usr/bin/python3 $(pwd)/api/security-api.py
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

# Create nginx configuration for web interface
echo ""
echo "Setting up web server..."

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

# Enable nginx site
sudo rm -f /etc/nginx/sites-enabled/default /etc/nginx/sites-enabled/camcon
sudo ln -sf /etc/nginx/sites-available/security-cam /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl restart nginx

# Enable camera
echo ""
echo "Enabling camera..."
if ! grep -q "^start_x=1" /boot/config.txt 2>/dev/null; then
    echo "start_x=1" | sudo tee -a /boot/config.txt
fi
if ! grep -q "^gpu_mem=" /boot/config.txt 2>/dev/null; then
    echo "gpu_mem=128" | sudo tee -a /boot/config.txt
fi

# Set permissions for directories
echo ""
echo "Setting permissions..."
chmod +x api/security-api.py
mkdir -p recordings logs stills
chmod 755 recordings logs stills

# Enable and start service
echo ""
echo "Enabling and starting service..."
sudo systemctl daemon-reload
sudo systemctl enable security-cam.service
sudo systemctl start security-cam.service

# Give service time to start
sleep 2

echo ""
echo "=================================="
echo "Setup Complete!"
echo "=================================="
echo ""
echo "Service Status:"
sudo systemctl status security-cam.service --no-pager || echo "Service may still be starting..."
echo ""
echo "Access the web interface at:"
PI_IP=$(hostname -I | awk '{print $1}')
echo "  http://$PI_IP"
echo ""
echo "Useful commands:"
echo "  sudo systemctl status security-cam   # Check status"
echo "  sudo systemctl restart security-cam  # Restart service"
echo "  sudo systemctl stop security-cam     # Stop service"
echo "  sudo journalctl -u security-cam -f   # View logs"
echo ""
echo "Note: For SSH development setup from your main PC, see:"
echo "  SSH_DEVELOPMENT_SETUP.md"
echo ""
echo "API endpoint: http://$PI_IP:5000/api"
echo ""
echo "Note: You may need to reboot for camera changes to take effect"
echo "      Run: sudo reboot"
