# Security Camera - Network Setup

## Portable Between Pi4 and Pi Zero

This setup creates network profiles for **both devices** on the same SD card. Move the card between devices and the network auto-configures!

## Quick Start

On Pi4 (with eth0 connected):

```bash
sudo bash /home/pi/dev/security-cam/setup_network.sh
```

It will:
1. Ask for your WiFi SSID and password (for Pi Zero profile)
2. Create both network profiles (eth0 for Pi4, wlan0 for Pi Zero)
3. Set up auto-activation at boot
4. Test the current device's network

## Network Configuration

### Pi4 (Ethernet)
- Interface: eth0
- Static IP: **192.168.4.175**
- Auto-activates on Pi4 boot

### Pi Zero (WiFi)
- Interface: wlan0
- Static IP: **192.168.4.176**
- Connects to your 192.168.4.x WiFi network
- Auto-activates on Pi Zero boot

## Using the SD Card

### Move from Pi4 → Pi Zero:
1. Shut down Pi4
2. Remove SD card, insert into Pi Zero
3. Boot Pi Zero
4. Network auto-activates on wlan0 (192.168.4.176)

### Move from Pi Zero → Pi4:
1. Shut down Pi Zero
2. Remove SD card, insert into Pi4
3. Boot Pi4
4. Network auto-activates on eth0 (192.168.4.175)

**No manual reconfiguration needed!**

## How It Works

- The script creates two nmcli connection profiles
- A systemd service runs at boot and detects your device type
- The correct profile is automatically activated
- Both profiles stay on the card for seamless switching

## Verification

Check your IP after booting:

```bash
# On Pi4
ip addr show eth0

# On Pi Zero
ip addr show wlan0
```

Ping the gateway:
```bash
ping 192.168.4.1
```

## Accessing the Camera

- **On Pi4**: `http://192.168.4.175/`
- **On Pi Zero**: `http://192.168.4.176/`

Both devices are on the same 192.168.4.0 network.

## Reconfiguring

To update WiFi or settings:
```bash
sudo bash /home/pi/dev/security-cam/setup_network.sh
```

This will recreate both profiles with new settings.
