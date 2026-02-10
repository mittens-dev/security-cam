# 🔒 Raspberry Pi Camera 3 Security System

A complete security camera system with motion detection and timestamps for Raspberry Pi Camera Module 3.

## Features

- ✅ **Real-time Motion Detection** - Frame differencing with optional region-based detection
- 🎯 **Detection Zones** - Draw custom regions on camera preview for targeted motion detection
- 📸 **Still Image Capture** - Automatic JPEG snapshot when motion is detected
- 📹 **MP4 Recording** - Auto-records to proper MP4 format when motion triggers
- 🌐 **Web Interface** - Modern, responsive control panel with canvas drawing
- 📊 **Event Logging** - Tracks all motion events with timestamps and pixel counts
- ⚙️ **Configurable Settings** - Adjust sensitivity, thresholds, recording duration, and regions
- 💾 **Recording Management** - View, download, and delete recordings and stills
- 🚀 **Auto-start on Boot** - Runs as a systemd service
- 🔌 **REST API** - Complete API for integration with other systems

## Hardware Requirements

- Raspberry Pi (3/4/5 recommended)
- Raspberry Pi Camera Module 3
- MicroSD card (16GB+ recommended for recordings)
- Power supply

## Quick Start

### 1. Network Configuration (One-Time Setup)
Configure static IP based on device type:
```bash
sudo ./configure_network.sh
```
- Pi4 → eth0 → 192.168.4.175
- Pi Zero → wlan0 → 192.168.4.176

See [Network Configuration Guide](./NETWORK_CONFIG.md) for details.

### 2. Install Dependencies
```bash
./setup.sh
```

## Development Setup

For development work with SSH access from your main PC, see:
**[SSH Development Setup Guide](./SSH_DEVELOPMENT_SETUP.md)**

This covers:
- Setting up SSH key authentication
- VS Code Remote development
- File syncing with rsync
- Running the dev server

## Quick Start

### 1. Clone the Repository

```bash
cd /home/pi/dev
git clone <your-repo-url> security-cam
cd security-cam
```

### 2. Run Setup Script

```bash
chmod +x setup.sh
./setup.sh
```

The setup script will:
- Install all system dependencies
- Set up Python virtual environment
- Install required packages
- Configure nginx web server
- Create and enable systemd service
- Enable the camera interface

### 3. Reboot (if first time)

```bash
sudo reboot
```

### 4. Access Web Interface

Open a browser and navigate to:
```
http://<your-pi-ip-address>
```

For example: `http://192.168.1.100`

## Configuration

### Web Interface Settings

Access the settings panel in the web interface to configure:

- **Motion Threshold**: Number of pixels that must change to trigger detection (default: 100)
- **Motion Sensitivity**: Difference threshold for pixel changes (default: 50, range: 0-255)
- **Record on Motion**: Automatically record when motion detected (default: enabled)
- **Recording Duration**: Length of recordings in seconds (default: 2)
- **Detection Regions**: Draw custom zones on camera preview (optional)
- **Use Region-Based Detection**: Enable detection only within drawn zones (default: disabled)
- **Save Stills**: Capture JPEG snapshots on motion (default: enabled)

### Configuration File

Edit `api/config.json` directly for advanced settings:

```json
{
  "motion_threshold": 100,
  "motion_sensitivity": 50,
  "record_on_motion": true,
  "recording_duration": 2,
  "detection_regions": [],
  "use_regions": false,
  "save_stills": true
}
```

Restart the service after editing:
```bash
sudo systemctl restart security-cam
```

## Usage

### Web Interface

The web interface provides:

1. **System Controls**
   - Start/Stop Monitoring
   - Manual Recording
   
2. **Status Display**
   - Monitoring status
   - Recording status
   - Motion detection status
   - Last motion timestamp

3. **Settings Panel**
   - Configure all detection parameters
   - Save settings permanently

4. **Motion Events Log**
   - View recent motion detection events
   - Timestamps and pixel change counts

5. **Recordings Manager**
   - List all recordings
   - Download recordings
   - Delete old recordings

### API Endpoints

The system provides a REST API at `http://<pi-ip>:5000/api`:

**Status & Control:**
- `GET /api/status` - Get system status (monitoring, recording, motion_detected, last_motion)
- `GET /api/config` - Get current configuration
- `PUT /api/config` - Update configuration
- `POST /api/monitoring/start` - Start motion detection monitoring
- `POST /api/monitoring/stop` - Stop monitoring

**Recording:**
- `POST /api/recording/start` - Start manual recording
- `POST /api/recording/stop` - Stop recording
- `GET /api/recordings` - List all recordings
- `GET /api/recordings/<filename>` - Download specific recording
- `DELETE /api/recordings/<filename>` - Delete recording

**Stills & Preview:**
- `GET /api/preview` - Get current camera frame as JPEG (for region drawing)
- `GET /api/stills` - List captured still images
- `GET /api/stills/<filename>` - Download specific still image
- `DELETE /api/stills/<filename>` - Delete still image

**Events:**
- `GET /api/events` - Get motion detection events log

## File Structure

```
security-cam/
├── api/
│   ├── security-api.py      # Main API server
│   └── config.json          # Configuration file
├── web/
│   ├── index.html           # Web interface
│   ├── script.js            # Frontend JavaScript
│   └── styles.css           # Styling
├── recordings/              # Video recordings (auto-created)
├── logs/                    # Motion event logs (auto-created)
├── requirements.txt         # Python dependencies
├── setup.sh                 # Installation script
└── README.md                # This file
```

## System Management

### Service Commands

```bash
# Check service status
sudo systemctl status security-cam

# Start service
sudo systemctl start security-cam

# Stop service
sudo systemctl stop security-cam

# Restart service
sudo systemctl restart security-cam

# View logs
sudo journalctl -u security-cam -f

# Disable auto-start
sudo systemctl disable security-cam
```

### Manual Operation

To run the API manually (for testing):

```bash
cd /home/pi/dev/security-cam
source venv/bin/activate
cd api
python3 security-api.py
```

## Motion Detection Details

The system uses **frame differencing** for motion detection:

1. Each frame is converted to grayscale
2. Gaussian blur is applied to reduce noise
3. Difference from previous frame is calculated
4. Pixels above sensitivity threshold are counted
5. If count exceeds motion threshold, motion is detected

### Tuning Motion Detection

- **Higher threshold** = less sensitive (fewer false positives)
- **Lower threshold** = more sensitive (catches smaller movements)
- **Higher sensitivity** = requires bigger changes per pixel
- **Lower sensitivity** = detects subtle changes

Recommended starting values:
- **Indoor, well-lit**: threshold=500, sensitivity=25
- **Outdoor, varying light**: threshold=800, sensitivity=35
- **High traffic area**: threshold=1000, sensitivity=30

## Storage Management

Recordings are stored in `recordings/` directory:

- Each recording includes timestamp in filename
- MP4 format with H.264 encoding
- Timestamps burned into video

To automatically delete old recordings, add a cron job:

```bash
crontab -e
```

Add line to delete recordings older than 7 days:
```
0 2 * * * find /home/pi/dev/security-cam/recordings -name "*.mp4" -mtime +7 -delete
```

## Troubleshooting

### Camera Not Detected

```bash
# Check if camera is enabled
vcgencmd get_camera

# Should show: supported=1 detected=1

# If not, edit /boot/config.txt
sudo nano /boot/config.txt

# Ensure these lines exist:
# start_x=1
# gpu_mem=128

# Reboot
sudo reboot
```

### Service Won't Start

```bash
# Check service logs
sudo journalctl -u security-cam -n 50

# Check if port 5000 is in use
sudo netstat -tulpn | grep 5000

# Test API manually
cd /home/pi/dev/security-cam
source venv/bin/activate
cd api
python3 security-api.py
```

### Web Interface Not Loading

```bash
# Check nginx status
sudo systemctl status nginx

# Check nginx configuration
sudo nginx -t

# View nginx error logs
sudo tail -f /var/log/nginx/error.log
```

### Motion Detection Too Sensitive

Lower the sensitivity in settings:
- Increase motion threshold (e.g., 1000+)
- Increase motion sensitivity value (e.g., 35+)

### Motion Detection Missing Events

Increase sensitivity:
- Decrease motion threshold (e.g., 300)
- Decrease motion sensitivity value (e.g., 15)

## Network Access

### Local Network Access

The web interface is accessible from any device on your local network at:
```
http://<raspberry-pi-ip>
```

Find your Pi's IP address:
```bash
hostname -I
```

### Remote Access (Optional)

For remote access, you can:

1. **Port Forwarding** - Forward port 80 on your router to the Pi
2. **VPN** - Set up a VPN server (WireGuard/OpenVPN)
3. **Tailscale** - Use Tailscale for easy secure access
4. **ngrok** - Use ngrok for temporary access

⚠️ **Security Note**: If exposing to the internet, add authentication!

## Backup

To backup your system:

```bash
# Backup configuration
cp api/config.json config.json.backup

# Backup motion events
cp logs/motion_events.json motion_events.backup.json

# Backup important recordings
cp recordings/motion_*.mp4 /path/to/backup/
```

## Performance

Typical resource usage:
- **CPU**: 5-15% (when monitoring)
- **RAM**: ~200MB
- **Storage**: ~50MB per minute of video (1080p)

For better performance:
- Lower resolution in config (e.g., [1280, 720])
- Reduce framerate (e.g., 15 or 20 FPS)
- Use motion detection instead of continuous recording

## Development

### Adding Features

The API is built with Flask and is easy to extend. Key files:

- **security-api.py**: Add new endpoints or modify detection logic
- **script.js**: Add new UI features or API calls
- **styles.css**: Modify appearance

After changes, restart the service:
```bash
sudo systemctl restart security-cam
```

### Testing

Test the API endpoints with curl:

```bash
# Get status
curl http://localhost:5000/api/status

# Start monitoring
curl -X POST http://localhost:5000/api/monitoring/start

# Get events
curl http://localhost:5000/api/events
```

## License

MIT License - Feel free to use and modify for your needs.

## Support

For issues or questions:
1. Check the Troubleshooting section
2. Review service logs: `sudo journalctl -u security-cam -f`
3. Check camera status: `vcgencmd get_camera`
4. Test manually: Run API script directly to see errors

## Credits

Built with:
- Flask - Web framework
- OpenCV - Computer vision
- Picamera2 - Raspberry Pi camera library
- Nginx - Web server

---

**Happy Securing! 🔒📹**
