# Network Configuration Guide

## Overview

This security camera system supports both Raspberry Pi 4 (with Ethernet) and Pi Zero (with WiFi). The network setup is portable - you can move the SD card between devices and the correct network configuration will automatically activate.

**Static IP Assignments:**
- **Pi4** (Ethernet) → `192.168.4.175`
- **Pi Zero** (WiFi) → `192.168.4.176`

## One-Time Setup

After cloning the repository, run this **once**:

```bash
sudo ./setup-network.sh
```

The script will:
1. Clean up any existing network configurations
2. Configure eth0 with static IP for Pi4
3. Configure wlan0 with static IP for Pi Zero (prompts for WiFi password)
4. Store configurations in NetworkManager

## Moving SD Card Between Devices

**No reconfiguration needed!** The network setup is interface-specific:

- **SD card in Pi4**: Automatically uses eth0 → `192.168.4.175`
- **SD card in Pi Zero**: Automatically uses wlan0 → `192.168.4.176`

The static IPs are tied to the interface names (eth0/wlan0), not MAC addresses, so switching is seamless.

## Accessing the Web Interface

Once configured:
- **Pi4**: `http://192.168.4.175`
- **Pi Zero**: `http://192.168.4.176`

Or use hostname: `http://<hostname>.local` (if mDNS is enabled)

## Multiple Devices on Same Network

To run multiple cameras simultaneously:

1. Edit the IP addresses in `setup-network.sh` before running:
   - Change `192.168.4.175` to `192.168.4.177` (for second Pi4)
   - Change `192.168.4.176` to `192.168.4.178` (for second Pi Zero)
2. Run the setup script on each device
3. Each camera will have its own unique IP

## Troubleshooting

### Check Current IP Address
```bash
# Pi4
ip addr show eth0

# Pi Zero  
ip addr show wlan0
```

### Check NetworkManager Connections
```bash
nmcli connection show
```

### Manually Activate Network
```bash
# Pi4
sudo nmcli connection up eth0-static

# Pi Zero
sudo nmcli connection up wlan0-static
```

### Test Network Connectivity
```bash
# Ping gateway
ping 192.168.4.1

# Check if web server is accessible
curl http://localhost
```

### Update WiFi Credentials (Pi Zero)
If you need to change WiFi password:
```bash
sudo nmcli connection modify wlan0-static wifi-sec.psk "NEW_PASSWORD"
sudo nmcli connection down wlan0-static
sudo nmcli connection up wlan0-static
```

## Technical Details

- Uses NetworkManager (`nmcli`) for all configuration
- Static IPs bound to interface names, not MAC addresses
- Configurations persist across reboots and SD card swaps
- GUI network settings are disabled to prevent conflicts
- Both Ethernet and WiFi profiles coexist on the same SD card

## Network Architecture

```
Router (192.168.4.1)
    │
    ├── Pi4 (eth0) ────> 192.168.4.175
    │
    └── Pi Zero (wlan0) ────> 192.168.4.176
```
