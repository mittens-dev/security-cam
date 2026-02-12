# Zone Detection - Corner Tracking

## Overview

The zone detection feature implements a three-zone sequential motion detection system designed to detect when an object stops at a "corner" (zone B) rather than continuing through to zone C.

## How It Works

1. **Zone A** - Starting zone: Motion here starts a 5-second detection cycle
2. **Zone B** - Middle zone: Motion here (after A) marks a potential "corner" stop
3. **Zone C** - End zone: Motion here means the object continued through (not a corner)

### Detection Logic

```
A detected → Tag A, start 5-second timer
B detected (A tagged) → Tag B, save picture
C detected (B tagged) → Tag C

After 5 seconds:
- If B tagged BUT C NOT tagged → Save zone B picture with "corner" filename
- If C tagged → Discard all pictures (object continued through)
- If only A tagged → Discard (didn't reach zone B)
```

## Configuration

### API Configuration (`PUT /api/config`)

```json
{
  "zone_detection_enabled": true,
  "zone_a": [100, 200, 300, 400],
  "zone_b": [350, 200, 550, 400],
  "zone_c": [600, 200, 800, 400],
  "zone_frame_interval": 0.15,
  "zone_cycle_duration": 5.0,
  "motion_threshold": 100,
  "motion_sensitivity": 15
}
```

### Configuration Parameters

- **zone_detection_enabled**: `true` to enable zone detection, `false` for regular motion detection
- **zone_a/b/c**: `[x1, y1, x2, y2]` coordinates in main stream resolution (e.g., 2304x1296)
  - x1, y1: top-left corner
  - x2, y2: bottom-right corner
- **zone_frame_interval**: Seconds between frames (0.1-0.2 recommended for fast detection)
- **zone_cycle_duration**: Total cycle time in seconds (default: 5.0)
- **motion_threshold**: Minimum pixels changed to detect motion (default: 100)
- **motion_sensitivity**: Threshold for motion detection sensitivity (default: 15)

## Defining Zones

Zones should be defined based on your camera's main resolution. For a 2304x1296 resolution:

### Example Zone Layout (Left to Right Path)

```
Zone A (Entry):     [100, 300, 400, 800]    (left side)
Zone B (Corner):    [450, 300, 900, 800]    (middle - where corner turn happens)
Zone C (Exit):      [950, 300, 2200, 800]   (right side - if they continue straight)
```

### Example Zone Layout (Top to Bottom Path)

```
Zone A (Entry):     [400, 100, 1200, 400]   (top)
Zone B (Corner):    [400, 450, 1200, 800]   (middle - corner area)
Zone C (Exit):      [400, 850, 1200, 1150]  (bottom - if they continue down)
```

## API Endpoints

### Start/Stop Monitoring

```bash
# Start monitoring (automatically uses zone mode if enabled)
curl -X POST http://localhost:5000/api/monitoring/start

# Stop monitoring
curl -X POST http://localhost:5000/api/monitoring/stop
```

### Get Zone Status

```bash
curl http://localhost:5000/api/zone-status
```

Returns:
```json
{
  "enabled": true,
  "zone_a_tagged": false,
  "zone_b_tagged": false,
  "zone_c_tagged": false,
  "cycle_active": false,
  "cycle_elapsed": 0,
  "zone_a": [100, 200, 300, 400],
  "zone_b": [350, 200, 550, 400],
  "zone_c": [600, 200, 800, 400],
  "frame_interval": 0.15,
  "cycle_duration": 5.0,
  "pictures_stored": {
    "a": 0,
    "b": 0,
    "c": 0
  }
}
```

### Update Configuration

```bash
curl -X PUT http://localhost:5000/api/config \
  -H "Content-Type: application/json" \
  -d '{
    "zone_detection_enabled": true,
    "zone_a": [100, 300, 400, 800],
    "zone_b": [450, 300, 900, 800],
    "zone_c": [950, 300, 2200, 800],
    "zone_frame_interval": 0.15
  }'
```

**Note:** Changing zone configuration while monitoring is active will automatically restart the monitor with the new settings.

## Saved Files

When a corner is detected, the zone B picture is saved with this filename format:

```
corner_YYYYMMDD_HHMMSS_<PROFILE>_L<LUMINANCE>.jpg
```

Example:
```
corner_20260212_143022_Da_L45.2.jpg
```

Where:
- `corner_` prefix indicates this was a corner detection
- Timestamp: when the picture was taken
- Profile: camera profile active at the time (Da=Day, Ni=Night, etc.)
- Luminance: scene brightness at capture time

These files are saved to the `stills/` directory alongside regular motion captures.

## Frame Rate and Performance

- **Recommended frame_interval**: 0.15 seconds (6.7 fps)
  - Faster (0.1s / 10fps) provides better detection but uses more CPU
  - Slower (0.2s / 5fps) reduces CPU usage but may miss fast-moving objects

- **Camera capability**: The Raspberry Pi Camera 3 can handle these frame rates well
- **5-second cycle**: With 0.15s intervals, you'll capture ~33 frames per cycle

## Tips for Setting Up Zones

1. **Use the preview endpoint** to see your camera view:
   ```bash
   curl http://localhost:5000/api/preview > preview.jpg
   ```

2. **Mark your zones** on the preview image to determine coordinates

3. **Test with /api/zone-status** to verify detections are happening correctly

4. **Adjust motion_threshold** if you're getting too many/too few detections
   - Lower threshold = more sensitive (detects smaller movements)
   - Higher threshold = less sensitive (only larger movements)

5. **Zone overlap** is OK - zones can overlap slightly for smoother transitions

## Switching Between Modes

To switch from zone detection back to regular motion detection:

```bash
curl -X PUT http://localhost:5000/api/config \
  -H "Content-Type: application/json" \
  -d '{"zone_detection_enabled": false}'
```

The system will automatically restart with regular motion detection mode.

## Troubleshooting

### No pictures being saved
- Check `/api/zone-status` to see if zones are being detected
- Verify zones are properly defined (not empty arrays)
- Check motion_threshold isn't too high

### Too many false detections
- Increase `motion_threshold` (e.g., from 100 to 200)
- Increase `motion_sensitivity` (e.g., from 15 to 25)
- Adjust zones to avoid areas with shadows or moving vegetation

### Objects not detected
- Decrease `motion_threshold` (e.g., from 100 to 50)
- Decrease `motion_sensitivity` (e.g., from 15 to 10)
- Verify zones are positioned where you expect motion

### System logs
Monitor the API logs for detailed zone detection activity:
```bash
journalctl -u security-api -f
```

Look for messages starting with `[zone]` for zone-specific debugging information.
