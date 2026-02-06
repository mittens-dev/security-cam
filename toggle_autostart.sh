#!/bin/bash

# Toggle autostart for security-cam and camcon-api services

echo "========================================"
echo "Service Autostart Manager"
echo "========================================"
echo ""

# Show current status
echo "Current Status:"
echo "--------------"

if sudo systemctl is-enabled security-cam.service >/dev/null 2>&1; then
    echo "✓ security-cam:  ENABLED"
    SC_STATUS="enabled"
else
    echo "✗ security-cam:  DISABLED"
    SC_STATUS="disabled"
fi

if sudo systemctl is-enabled camcon-api.service >/dev/null 2>&1; then
    echo "✓ camcon-api:    ENABLED"
    CC_STATUS="enabled"
else
    echo "✗ camcon-api:    DISABLED"
    CC_STATUS="disabled"
fi

echo ""
echo "Options:"
echo "--------"
echo "  1) Toggle security-cam autostart"
echo "  2) Toggle camcon-api autostart"
echo "  3) Enable security-cam, disable camcon-api (default)"
echo "  4) Exit"
echo ""

read -p "Choose option (1-4): " choice

case $choice in
    1)
        if [ "$SC_STATUS" = "enabled" ]; then
            echo ""
            echo "Disabling security-cam autostart..."
            sudo systemctl disable security-cam.service
            echo "✓ security-cam is now DISABLED"
        else
            echo ""
            echo "Enabling security-cam autostart..."
            sudo systemctl enable security-cam.service
            echo "✓ security-cam is now ENABLED"
        fi
        ;;
    2)
        if [ "$CC_STATUS" = "enabled" ]; then
            echo ""
            echo "Disabling camcon-api autostart..."
            sudo systemctl disable camcon-api.service
            echo "✓ camcon-api is now DISABLED"
        else
            echo ""
            echo "Enabling camcon-api autostart..."
            sudo systemctl enable camcon-api.service
            echo "✓ camcon-api is now ENABLED"
        fi
        ;;
    3)
        echo ""
        echo "Setting default: security-cam ENABLED, camcon-api DISABLED..."
        sudo systemctl enable security-cam.service
        sudo systemctl disable camcon-api.service
        echo "✓ Configuration set to defaults"
        ;;
    4)
        echo "Exiting..."
        exit 0
        ;;
    *)
        echo "Invalid option!"
        exit 1
        ;;
esac

echo ""
echo "New Status:"
echo "-----------"

if sudo systemctl is-enabled security-cam.service >/dev/null 2>&1; then
    echo "✓ security-cam:  ENABLED"
else
    echo "✗ security-cam:  DISABLED"
fi

if sudo systemctl is-enabled camcon-api.service >/dev/null 2>&1; then
    echo "✓ camcon-api:    ENABLED"
else
    echo "✗ camcon-api:    DISABLED"
fi

echo ""
