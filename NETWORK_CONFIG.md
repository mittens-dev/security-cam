# Network Configuration Guide

## Overview
Simple static IP configuration that auto-detects device type:
- **Pi4** → eth0 → `192.168.4.175`
- **Pi Zero** → wlan0 → `192.168.4.176`

## One-Time Setup

Run this **once** after cloning the repo:

```bash
sudo ./configure_network.sh
```

The script will:
1. Detect if it's running on Pi4 (has eth0) or Pi Zero (no eth0)
2. Configure static IP accordingly
3. Store configuration in NetworkManager

## Moving SD Card Between Pis

**No action needed!** The configuration is interface-specific:
- When SD card is in Pi4: Uses eth0 config (192.168.4.175)
- When SD card is in Pi Zero: Uses wlan0 config (192.168.4.176)

The static IPs are tied to the interface, not the device MAC address, so it works seamlessly.

## Multiple Devices on Same Network

To add more devices (e.g., a second Pi4 or Pi Zero running simultaneously):
1. Choose different IPs (e.g., 192.168.4.177, 192.168.4.178)
2. Edit the `IP_ADDRESS` variable in `configure_network.sh` before running
3. Run the script on each device

## Troubleshooting

Check current IP:
```bash
ip addr show eth0    # Pi4
ip addr show wlan0   # Pi Zero
```

Check NetworkManager connections:
```bash
nmcli connection show
```

Manually bring up interface:
```bash
sudo nmcli connection up eth0    # Pi4
sudo nmcli connection up wlan0   # Pi Zero
```

## Technical Details

- Uses NetworkManager (nmcli) for all configuration
- GUI network settings are disabled (no conflicts)
- Static IPs bound to interface names, not MAC addresses
- Configurations persist across reboots and SD card swaps
