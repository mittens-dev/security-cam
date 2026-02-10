# 🔒 Raspberry Pi Camera 3 Security System (Stills-Only)

A lightweight, stills-only security camera system with intelligent motion detection and adaptive camera profiles for Raspberry Pi Camera Module 3.

## Features

- 📸 **Stills-Only Capture** - Lightweight JPEG snapshots, no video encoding overhead
- 🎯 **Detection Zones** - Draw custom regions for targeted motion detection
- 🌅 **Adaptive Camera Profiles** - Automatic adjustment based on ambient light (5 levels: Day Bright, Day, Dusk Bright, Dusk Dark, Night)
- 🔆 **Calibration Regions** - Define areas for accurate luminance measurement
- ⚡ **Burst Mode** - Capture multiple frames per motion event
- 🌐 **Web Interface** - Modern, responsive control panel with region drawing
- 👤 **Ownership Controls** - Multi-client browser sync with ownership management
- 📊 **Event Logging** - Tracks all motion events with timestamps and pixel counts
- ⚙️ **Configurable Settings** - Adjust sensitivity, thresholds, burst count, and regions
- 💾 **Recording Management** - View, download, and delete stills
- 🗄️ **Daily Archiving** - Automatic organization of stills by date
- 🚀 **Auto-start on Boot** - Runs as a systemd service
- 🔌 **REST API** - Complete API for integration with other systems

## Why Stills-Only?

This system is optimized for reliability and efficiency:
- **Lower CPU usage** - No video encoding overhead
- **Faster response** - Immediate still capture vs. buffered video
- **Better stability** - Fewer moving parts, no encoder crashes
- **Easier review** - Individual JPEGs with timestamps in filename
- **Storage efficiency** - Only capture when motion detected

## Hardware Requirements

- Raspberry Pi (4/5 recommended, Zero 2 W supported)
- Raspberry Pi Camera Module 3
- MicroSD card (32GB+ recommended)
- Power supply

## Quick Start

### 1. Clone Repository

```bash
cd /home/pi/dev
git clone <your-repo-url> security-cam
cd security-cam
```

### 2. First-Time Setup

```bash
chmod +x *.sh
sudo ./setup-first-time.sh
```

This installs all system dependencies and configures the camera.

### 3. Network Configuration

```bash
sudo ./setup-network.sh
```

Configures static IPs:
- **Pi4** (Ethernet): `192.168.4.175`
- **Pi Zero** (WiFi): `192.168.4.176`

See [Network Configuration Guide](./NETWORK_CONFIG.md) for details.

### 4. Setup Services

```bash
sudo ./setup-api.sh    # API service
sudo ./setup-web.sh    # Web server (nginx)
```

### 5. Reboot

```bash
sudo reboot
```

### 6. Access Web Interface

Open a browser:
- **Pi4**: `http://192.168.4.175`
- **Pi Zero**: `http://192.168.4.176`
- **Or**: `http://<hostname>.local`

## Configuration

### Web Interface Settings

Access the settings panel to configure:

**Motion Detection:**
- **Capture on Motion** - Trigger still capture when motion detected
- **Motion Threshold** - Total changed pixels needed (combined across all regions)
- **Motion Sensitivity** - Per-pixel change threshold (0-255, lower = more sensitive)
- **Burst Count** - Number of stills per motion event (1-15)
- **Burst Interval** - Seconds between burst captures (0.1-3s)
- **Cooldown** - Seconds to wait between bursts (prevents flooding, 1-60s)

**Detection Regions:**
- Draw custom zones on camera preview
- Enable/disable region-based detection
- Regions are combined (total pixels across all regions)

**Calibration Regions:**
- Define areas for luminance measurement (avoid bright spots like sky)
- Used for automatic camera profile switching

**Camera Settings:**
- Manual control over exposure, gain, contrast, saturation, etc.
- Overrides automatic profiles when adjusted

### Automatic Camera Profiles

The system measures ambient luminance and automatically switches between 5 profiles:

1. **Day Bright** (L≥160) - Full sun, high exposure control
2. **Day** (L≥120) - Normal daylight
3. **Dusk Bright** (L≥80) - Golden hour, moderate adjustments
4. **Dusk Dark** (L≥40) - Twilight, increased gain
5. **Night** (L<40) - Low light, maximum gain

Luminance values are added to filenames (e.g., `motion_20260210_145530_burst1_Da_L142.5.jpg`)

### Configuration File

Advanced settings in `api/config.json`:

```json
{
  "motion_threshold": 100,
  "motion_sensitivity": 20,
  "capture_on_motion": true,
  "burst_count": 4,
  "burst_interval": 0.3,
  "cooldown_seconds": 3,
  "detection_regions": [],
  "use_regions": false,
  "calibration_regions": [],
  "use_calibration_regions": false
}
```

Restart after editing:
```bash
sudo systemctl restart security-cam
```

## Usage

### System Controls

**Start/Stop Monitoring:**
- Click "Start Monitoring" to begin motion detection
- Click "Stop Monitoring" to pause

**Manual Snapshot:**
- Click "Take Snapshot" to capture burst manually

**Settings:**
- Adjust motion detection parameters
- Click "Save Settings" to persist changes
- Click "Refresh Settings" to reload from server

**Ownership:**
- Click "Claim Ownership" to control settings from your browser
- Other browsers will see settings as read-only
- Click "Release Ownership" or "Hard Refresh" to release control

### Drawing Detection Regions

1. Click "Draw Detection Zones"
2. Draw rectangles on the camera preview
3. Click regions to select/deselect
4. Click "Delete Selected" to remove
5. Toggle "Detection Mode" / "Calibration Mode"
6. Click "Save Regions" to apply

**Tips:**
- Draw regions around areas where motion matters (doors, windows, paths)
- Avoid areas with trees, shadows, or frequent non-important motion
- Use calibration regions to exclude sky or bright windows from light measurement

### File Organization

Stills are organized by date:
```
stills/
├── 2026-02-10/
│   ├── motion_20260210_081530_burst1_Da_L125.3.jpg
│   ├── motion_20260210_081530_burst2_Da_L125.3.jpg
│   └── ...
├── motion_20260210_143025_burst1_KD_L55.8.jpg  # Recent, not yet archived
└── ...
```

Automatic daily archiving runs at midnight (via cron job).

## API Endpoints

REST API at `http://<pi-ip>/api`:

**Status & Control:**
- `GET /api/status` - System status (monitoring, capturing, motion, luminance, profile)
- `GET /api/config` - Current configuration
- `PUT /api/config` - Update configuration
- `POST /api/monitoring/start` - Start monitoring
- `POST /api/monitoring/stop` - Stop monitoring

**Capture:**
- `POST /api/snapshot` - Manual burst capture

**Stills:**
- `GET /api/stills` - List captured images
- `GET /api/stills/<filename>` - Download specific image
- `DELETE /api/stills/<filename>` - Delete image
- `DELETE /api/stills/all` - Delete all stills

**Events:**
- `GET /api/events` - Motion detection event log

**Archiving:**
- `POST /api/archive` - Manually trigger archiving (runs daily automatically)

**Ownership:**
- `POST /api/claim` - Claim configuration ownership
- `POST /api/release` - Release ownership
- `GET /api/owner` - Check current owner

**Preview:**
- `GET /api/preview` - Current camera frame (for region drawing)

## System Management

### Service Commands

```bash
# Check status
sudo systemctl status security-cam

# Start/stop/restart
sudo systemctl start security-cam
sudo systemctl stop security-cam
sudo systemctl restart security-cam

# View live logs
sudo journalctl -u security-cam -f

# Disable auto-start
sudo systemctl disable security-cam
```

### Manual Operation

For testing/development:

```bash
cd /home/pi/dev/security-cam/api
python3 security-api.py
```

## Motion Detection Details

Uses **dual-stream motion detection**:
- **Main stream** (1920x1080) - High-quality still captures
- **Lores stream** (320x240) - Lightweight motion detection

**Algorithm:**
1. Convert lores frame to grayscale
2. Apply Gaussian blur to reduce noise
3. Calculate difference from previous frame
4. Threshold based on sensitivity setting
5. Count changed pixels
6. Apply detection region mask (if enabled)
7. Trigger if total pixels > threshold

**Tuning Tips:**
- **Threshold 50-100** - Good for focused detection regions
- **Threshold 100-200** - Good for full-frame detection
- **Sensitivity 15-25** - Standard daylight conditions  
- **Sensitivity 20-30** - Low light conditions
- Monitor stats logs every 30 seconds to see peak pixel counts

## Storage Management

### Disk Space

Check available space:
```bash
df -h /
```

### Clean Old Stills

Manual cleanup:
```bash
# Delete stills older than 7 days
find /home/pi/dev/security-cam/stills -type f -mtime +7 -delete

# Delete specific date folders
rm -rf /home/pi/dev/security-cam/stills/2026-02-01
```

### Automatic Archiving

Daily archiving runs at midnight via cron (set up by `setup-api.sh`):
- Moves loose stills into date folders
- Organizes by `YYYY-MM-DD/` format

## Troubleshooting

### Camera Not Detected

```bash
# Check camera
vcgencmd get_camera
# Should show: supported=1 detected=1

# Check libcamera
libcamera-hello --list-cameras
```

### Service Won't Start

```bash
# Check logs
sudo journalctl -u security-cam -n 100

# Check Python syntax
cd /home/pi/dev/security-cam/api
python3 -m py_compile security-api.py

# Test manually
python3 security-api.py
```

### Web Interface Errors

```bash
# Check nginx
sudo systemctl status nginx
sudo nginx -t

# View nginx logs
sudo tail -f /var/log/nginx/error.log

# Test API directly
curl http://localhost:5000/api/status
```

### Disk Full

```bash
# Check space
df -h /

# Clean old stills
find /home/pi/dev/security-cam/stills -type d -name "2026-*" -mtime +7 -exec rm -rf {} \;
```

### Motion Detection Issues

**Too many false positives:**
- Increase threshold (100+)
- Draw detection regions to focus on important areas
- Avoid regions with trees, clouds, reflections

**Missing motion events:**
- Lower threshold (50-75)
- Lower sensitivity (15-20)
- Check stats logs for peak pixel counts

## Development Setup

For SSH and remote development, see [SSH Development Setup Guide](./SSH_DEVELOPMENT_SETUP.md)

Covers:
- SSH key authentication
- VS Code Remote development
- File syncing
- Development server setup

## File Structure

```
security-cam/
├── api/
│   ├── security-api.py       # Main API server
│   └── config.json           # Configuration
├── web/
│   ├── index.html            # Web interface
│   ├── script.js             # Frontend JavaScript
│   └── styles.css            # Styling
├── stills/                   # Still images (organized by date)
├── logs/                     # Motion event logs
├── setup-first-time.sh       # Initial system setup
├── setup-network.sh          # Network configuration
├── setup-api.sh              # API service setup
├── setup-web.sh              # Web server setup
├── requirements.txt          # Python dependencies
├── NETWORK_CONFIG.md         # Network setup guide
├── SSH_DEVELOPMENT_SETUP.md  # Development guide
└── README.md                 # This file
```

## Performance

Typical resource usage on Pi 4:
- **CPU**: 5-10% idle, 15-25% during capture
- **RAM**: ~200MB
- **Storage**: ~200-800KB per JPEG (varies with scene complexity)

Calibration loop runs every 60 seconds, captures take ~300ms per frame.

## Credits

Built with:
- **Flask** - Web framework
- **picamera2** - Raspberry Pi Camera library  
- **OpenCV** - Computer vision
- **Nginx** - Web server
- **libcamera** - Camera stack

## License

MIT License - Feel free to use and modify.

---

**Happy Monitoring! 🔒📸**
