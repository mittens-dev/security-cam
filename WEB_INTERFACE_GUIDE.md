# Corner Detection Web Interface Guide

## Overview

The web interface now includes a complete corner detection zone configuration system with visual zone drawing, live status monitoring, and easy configuration management.

## Features Added

### 1. Corner Detection Zones Section

Located on the main page, the new "Corner Detection Zones" section includes:

- **🚦 Visual Zone Status**: Shows the definition status of zones A, B, and C with color-coded badges
  - Zone A (Green): Entry zone
  - Zone B (Orange): Corner zone
  - Zone C (Red): Exit zone

- **Enable/Disable Toggle**: Checkbox to enable corner detection mode
- **Frame Rate Settings**: Adjustable frame interval (0.1-0.5s) and cycle duration (3-10s)
- **Live Detection Status**: Real-time monitoring of zone detections during active monitoring

### 2. Visual Zone Drawing Modal

Click "✏️ Define A→B→C Zones" to open the interactive zone drawing interface:

#### Drawing Zones
1. Click on a zone button (A, B, or C) to select which zone to draw
2. Click and drag on the camera preview to draw a rectangular zone
3. The system automatically advances to the next zone after drawing
4. Repeat for all three zones

#### Zone Management
- **Clear Individual Zones**: Click the ✗ button next to any zone definition
- **Redraw Zones**: Select a zone and draw over it to redefine
- **Visual Feedback**: Each zone is displayed with its distinctive color overlay

#### Modal Features
- Live camera preview with scaled display
- Color-coded zone overlays (Green for A, Orange for B, Red for C)
- Coordinate display for each defined zone
- Current drawing indicator showing which zone is active

### 3. Live Status Monitoring

When corner detection is enabled and monitoring is active, a live status panel shows:

- **Zone A Status**: Shows if entry zone has been triggered (✓ Tagged / ○ Waiting)
- **Zone B Status**: Shows if corner zone has been triggered
- **Zone C Status**: Shows if exit zone has been triggered
- **Cycle Status**: Shows cycle state (Active with timer / Idle)

Status updates every 2 seconds automatically.

## How to Use

### Step 1: Define Zones

1. Navigate to the "Corner Detection Zones" section
2. Click **"✏️ Define A→B→C Zones"**
3. Draw Zone A (entry area) - click and drag on the preview
4. Draw Zone B (corner area where you want to detect stops)
5. Draw Zone C (exit area indicating they continued through)
6. Click **"✓ Save Zones"**

### Step 2: Configure Settings

1. Set **Frame Interval**: 0.15s recommended (6-7 frames per second)
2. Set **Cycle Duration**: 5.0s (how long to monitor the sequence)
3. Check the **"Enable Corner Detection Mode"** checkbox

### Step 3: Start Monitoring

1. If monitoring is already active, **stop and restart** monitoring to apply zone detection mode
2. Click **"▶ Start Monitoring"** to begin corner detection
3. The system automatically switches to zone-based monitoring

### Step 4: Monitor Activity

- Watch the **Live Detection Status** panel for real-time zone triggers
- Check the **Captured Stills** section for "corner_*" images
- Corner pictures are only saved when Zone B is reached but Zone C is not

## Configuration Tips

### Zone Placement

**Example: Driveway Corner Detection**
```
┌─────────────────────────────┐
│         CAMERA VIEW         │
│                             │
│  A────────┐                 │  Zone A: Driveway entry
│  │ Entry  │    B──────┐     │  Zone B: Corner/turn area
│  └────────┘    │Corner│     │  Zone C: Continuing straight
│                └──────┘     │
│                   C────┐    │
│                   │Exit│    │
│                   └────┘    │
└─────────────────────────────┘
```

### Frame Rate Guidelines

- **0.10s** (10 fps): Fast detection, higher CPU usage
- **0.15s** (6.7 fps): **Recommended** - good balance
- **0.20s** (5 fps): Slower but less CPU intensive

### Cycle Duration

- **5 seconds**: Default, works for most scenarios
- **3-4 seconds**: For fast-moving objects or short paths
- **6-8 seconds**: For slow-moving objects or longer paths

## Visual Indicators

### Zone Badges

The circular badges show zone status:
- **Full opacity + ✓**: Zone is defined
- **Half opacity**: Zone not defined
- **Green (A)**: Entry detection
- **Orange (B)**: Corner detection
- **Red (C)**: Exit detection

### Live Status Colors

In the live status panel:
- **Green (✓ Tagged)**: Zone has been triggered this cycle
- **Gray (○ Waiting)**: Zone waiting for detection
- **Orange (Active)**: Cycle in progress with timer
- **Gray (Idle)**: No active detection cycle

## Troubleshooting

### Zones Not Saving
- Ensure all three zones are drawn before saving
- Check that monitoring is stopped before reconfiguring
- Verify the preview image loads correctly

### No Corner Pictures
- Confirm "Enable Corner Detection Mode" is checked
- Verify all three zones are defined (show as "Defined ✓")
- Check that monitoring was restarted after enabling zone detection
- Review zone placement - zones may need adjustment

### Live Status Not Updating
- Ensure corner detection mode is enabled
- Confirm monitoring is active
- Check the cycle duration setting (must complete a cycle)

### False Detections
- Increase motion threshold in main settings
- Adjust motion sensitivity
- Redefine zones to avoid areas with shadows or moving vegetation
- Make zones more specific to the path of interest

## Technical Details

### Zone Coordinates

Zones are stored as `[x1, y1, x2, y2]` in main stream resolution (e.g., 2304x1296):
- (x1, y1): Top-left corner
- (x2, y2): Bottom-right corner

The web interface automatically scales these to the preview size for visualization.

### API Integration

The web interface communicates with these API endpoints:
- `GET /api/zone-status` - Real-time zone detection status
- `PUT /api/config` - Save zone configuration
- `GET /api/preview` - Camera preview for zone drawing

### Browser Compatibility

Tested and working on:
- Chrome/Edge (recommended)
- Firefox
- Safari on macOS/iOS
- Chrome on Android

## Keyboard Shortcuts

While in the zone drawing modal:
- **Click A/B/C buttons**: Switch active zone
- **Click and drag**: Draw zone rectangle
- **ESC**: Cancel (close modal without saving)

## File Naming

Corner-detected pictures are saved with this format:
```
corner_20260212_143022_Da_L45.2.jpg
```
- `corner_`: Prefix indicating corner detection
- Timestamp: When captured
- Profile code: Camera profile active (Da=Day, Ni=Night, etc.)
- Luminance: Scene brightness level

These files appear in the stills gallery with the "corner_" prefix.

## Tips for Best Results

1. **Test zone placement**: Draw zones, enable detection, and watch live status to verify triggers
2. **Adjust frame rate**: Start with 0.15s and adjust based on object speed
3. **Fine-tune zones**: Redraw zones if you're getting false positives or missing detections
4. **Monitor CPU usage**: Reduce frame rate if system becomes sluggish
5. **Review saved corners**: Check captured images to validate zone effectiveness

## Next Steps

After setting up corner detection:
1. Test with known scenarios (e.g., walk through the zones yourself)
2. Review captured "corner_" images to verify detection accuracy
3. Adjust zones, thresholds, or timing as needed
4. Set up automatic archiving for old stills (see main README)

For more technical details about the detection algorithm, see `ZONE_DETECTION_README.md`.
