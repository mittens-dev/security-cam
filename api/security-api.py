#!/usr/bin/env python3
"""
Raspberry Pi Camera 3 Security System — Stills-Only Edition
Uses picamera2 dual-stream:
- main (1280x720) for still captures
- lores (320x240) for motion detection
No video encoding — lightweight and stable on Pi hardware.
"""
import sys
import json
import time
import threading
from datetime import datetime
from pathlib import Path
from flask import Flask, request, jsonify, send_from_directory, send_file
from flask_cors import CORS
from picamera2 import Picamera2
import cv2
import numpy as np
import io
from PIL import Image, ImageEnhance

# === PATHS ===
BASE_DIR = Path(__file__).parent.parent
RECORDINGS_DIR = BASE_DIR / 'recordings'
STILLS_DIR = BASE_DIR / 'stills'
LOGS_DIR = BASE_DIR / 'logs'
CONFIG_FILE = BASE_DIR / 'api' / 'config.json'
EVENTS_FILE = LOGS_DIR / 'motion_events.json'

RECORDINGS_DIR.mkdir(exist_ok=True)
STILLS_DIR.mkdir(exist_ok=True)
LOGS_DIR.mkdir(exist_ok=True)

# === FLASK APP ===
app = Flask(__name__, static_folder=str(BASE_DIR / 'web'), static_url_path='')
CORS(app)

# === STATE ===
config = {
    'motion_threshold': 500,
    'motion_sensitivity': 25,
    'capture_on_motion': True,
    'burst_count': 5,
    'burst_interval': 0.5,
    'cooldown_seconds': 5,
    'detection_regions': [],
    'use_regions': False,
    'save_stills': True,
    'camera_settings': {}
}

state = {
    'monitoring': False,
    'capturing': False,
    'motion_detected': False,
    'last_motion': None,
    'active_profile': None
}

# Frame cache for preview (avoids camera lock contention)
_cached_frame = None
_cached_frame_time = 0
FRAME_CACHE_TTL = 0.5  # seconds — serve cached frame if < 500ms old

motion_events = []
camera = None
camera_lock = threading.Lock()
prev_lores = None
stop_flag = threading.Event()
calibration_stop = threading.Event()
calibration_trigger = threading.Event()  # Set to force immediate calibration
monitor_thread = None

LORES_SIZE = (320, 240)

# MAIN_SIZE = (1280, 720)  # 720p resolution
# MAIN_SIZE = (1920, 1080)  # 1080p resolution
MAIN_SIZE = (2304, 1296)  # 3MP resolution
# MAIN_SIZE = (4608, 2592)

# === CAMERA PROFILES (applied automatically based on scene luminance) ===
CAMERA_PROFILES = {
    "DAY": {
        "AeEnable": True,
        "AwbEnable": True,             # Let ISP handle white balance in day
        # No ColourGains here — allow libcamera to manage colour pipeline
        "Brightness": 0.0,
        "Contrast": 1.0,
        "Saturation": 1.0,
        "Sharpness": 1.0,
        "NoiseReductionMode": 2,
    },
    "DUSK": {
        "AeEnable": True,
        "AwbEnable": True,
        "ExposureValue": 0.5,          # Boost exposure slightly in low light
        "AnalogueGain": 2.0,
        "Brightness": 0.0,
        "Contrast": 1.0,
        "Saturation": 1.0,
        "Sharpness": 1.0,
        "NoiseReductionMode": 2,
    },
    "NIGHT": {
        "AeEnable": True,
        "AwbEnable": True,             # Keep AWB on initially to avoid CCM mismatch
        "Brightness": 0.0,
        "Contrast": 1.0,
        "Saturation": 0.9,             # reduce chroma noise
        "Sharpness": 0.8,
        "NoiseReductionMode": 3,
    }
}

# Scene classification thresholds (luminance 0-255)
DAY_THRESHOLD = 140     # Above this = DAY profile
DUSK_THRESHOLD = 90     # Above this = DUSK, below = NIGHT

# How often to check scene and switch profiles (in seconds)
CALIBRATION_INTERVAL_SECONDS = 300  # Every 5 minutes


def frame_to_image(frame):
    """Convert camera frame to PIL Image.
    picamera2 'RGB888' actually delivers BGR byte order, so swap to RGB for PIL."""
    return Image.fromarray(frame[:, :, ::-1])


def frame_to_jpeg_bytes(frame, quality=85):
    """Convert camera frame to JPEG BytesIO via PIL.
    picamera2 'RGB888' = BGR, swap to RGB for PIL."""
    img = Image.fromarray(frame[:, :, ::-1])
    buf = io.BytesIO()
    img.save(buf, 'JPEG', quality=quality)
    buf.seek(0)
    return buf


def _get_cached_frame():
    """Return a JPEG BytesIO of the current camera frame, using a cache
    to avoid hammering the camera lock on rapid preview/UI requests.
    Cache TTL is FRAME_CACHE_TTL seconds (default 0.5s).
    """
    global _cached_frame, _cached_frame_time

    now = time.time()
    if _cached_frame and (now - _cached_frame_time) < FRAME_CACHE_TTL:
        # Serve cached copy
        buf = io.BytesIO(_cached_frame)
        buf.seek(0)
        return buf

    # Capture fresh frame
    with camera_lock:
        with camera.captured_request() as req:
            frame = req.make_array("main")

    buf = frame_to_jpeg_bytes(frame)
    _cached_frame = buf.getvalue()
    _cached_frame_time = now
    buf.seek(0)
    return buf


# === CONFIG ===

def load_config():
    global config
    try:
        if CONFIG_FILE.exists():
            with open(CONFIG_FILE) as f:
                saved = json.load(f)
                # Migrate old config keys
                if 'record_on_motion' in saved and 'capture_on_motion' not in saved:
                    saved['capture_on_motion'] = saved.pop('record_on_motion')
                if 'recording_duration' in saved:
                    saved.pop('recording_duration', None)
                if 'pre_record_seconds' in saved:
                    saved.pop('pre_record_seconds', None)
                config.update(saved)
    except Exception as e:
        print(f"Config error: {e}", flush=True)


def save_config():
    try:
        with open(CONFIG_FILE, 'w') as f:
            json.dump(config, f, indent=2)
    except Exception as e:
        print(f"Save config error: {e}", flush=True)


def load_events():
    global motion_events
    try:
        if EVENTS_FILE.exists():
            with open(EVENTS_FILE) as f:
                motion_events = json.load(f)
    except:
        motion_events = []


def save_event(pixels):
    now = datetime.now()
    state['motion_detected'] = True
    state['last_motion'] = now.isoformat()

    motion_events.append({
        'timestamp': now.isoformat(),
        'pixels_changed': pixels
    })

    while len(motion_events) > 100:
        motion_events.pop(0)

    try:
        with open(EVENTS_FILE, 'w') as f:
            json.dump(motion_events, f)
    except:
        pass


# === CAMERA ===

def get_camera_controls():
    """Get controls for camera init — uses DAY profile as default.
    Actual runtime controls are managed by the profile-based calibration loop.
    """
    return CAMERA_PROFILES["DAY"]


def init_camera():
    """Initialize camera with dual-stream config (no encoder)."""
    global camera

    if camera is not None:
        try:
            camera.close()
        except:
            pass
        camera = None

    try:
        camera = Picamera2()
        video_config = camera.create_video_configuration(
            main={"size": MAIN_SIZE, "format": "RGB888"},
            lores={"size": LORES_SIZE, "format": "YUV420"},
            controls=get_camera_controls()
        )
        camera.configure(video_config)
        print("Camera initialized (dual-stream, no encoder)", flush=True)
        return True
    except Exception as e:
        print(f"Camera init failed: {e}", flush=True)
        camera = None
        return False


def archive_old_stills():
    """Move stills from previous days into dated subfolders (YYYY-MM-DD format).
    Called once daily at midnight via cron, or manually via API.
    """
    today = datetime.now().date()
    today_str = today.isoformat()  # e.g., "2026-02-08"
    
    archived_count = 0
    for jpg_file in STILLS_DIR.glob('*.jpg'):
        try:
            # Extract date from filename: motion_YYYYMMDD_...
            parts = jpg_file.name.split('_')
            if len(parts) >= 2 and parts[0] == 'motion':
                # Parse YYYYMMDD from filename
                date_str = parts[1]  # e.g., "20260207"
                if len(date_str) == 8:
                    file_date = datetime.strptime(date_str, '%Y%m%d').date()
                    file_date_str = file_date.isoformat()  # e.g., "2026-02-07"
                    
                    # If file is from yesterday or earlier, move it
                    if file_date < today:
                        target_dir = STILLS_DIR / file_date_str
                        target_dir.mkdir(exist_ok=True)
                        target_path = target_dir / jpg_file.name
                        jpg_file.rename(target_path)
                        archived_count += 1
                        print(f"[archive] Moved {jpg_file.name} → {file_date_str}/", flush=True)
        except Exception as e:
            print(f"[archive] Error processing {jpg_file.name}: {e}", flush=True)
    
    if archived_count > 0:
        print(f"[archive] Archived {archived_count} stills", flush=True)
    return archived_count


def capture_burst(count=None, interval=None):
    """Capture a burst of still images from the running camera.
    Uses capture_array("main") - non-blocking and safe for concurrent use.
    Includes extra logging for diagnostics when captures fail or are skipped.
    """
    if not camera or not camera.started:
        print("[capture_burst] Camera not started or unavailable", flush=True)
        return []

    if count is None:
        count = config.get('burst_count', 5)
    if interval is None:
        interval = config.get('burst_interval', 0.5)

    print(f"[capture_burst] start count={count} interval={interval}", flush=True)

    filenames = []
    ts_base = datetime.now().strftime("%Y%m%d_%H%M%S")

    for i in range(count):
        try:
            print(f"[capture_burst] capturing frame {i+1}/{count}", flush=True)
            # capture_array is non-blocking and thread-safe
            frame = camera.capture_array("main")
            img = frame_to_image(frame)

            # Save pure ISP output — no post-processing
            filename = f"motion_{ts_base}_burst{i+1}.jpg"
            filepath = STILLS_DIR / filename
            img.save(str(filepath), 'JPEG', quality=90)
            filenames.append(filename)
            print(f"[capture_burst] Burst {i+1}/{count}: {filename}", flush=True)

            if i < count - 1:
                time.sleep(interval)
        except Exception as e:
            print(f"[capture_burst] Burst {i+1} error: {e}", flush=True)

    print(f"[capture_burst] done, saved {len(filenames)} files", flush=True)
    return filenames


def build_region_mask():
    """Pre-compute region mask for lores stream dimensions"""
    if not config.get('use_regions') or not config.get('detection_regions'):
        return None

    scale_x = LORES_SIZE[0] / MAIN_SIZE[0]
    scale_y = LORES_SIZE[1] / MAIN_SIZE[1]

    mask = np.zeros((LORES_SIZE[1], LORES_SIZE[0]), dtype=np.uint8)
    for region in config['detection_regions']:
        x1, y1, x2, y2 = region
        lx1 = int(x1 * scale_x)
        ly1 = int(y1 * scale_y)
        lx2 = int(x2 * scale_x)
        ly2 = int(y2 * scale_y)
        mask[ly1:ly2, lx1:lx2] = 255
    return mask


def detect_motion_lores(lores_frame, region_mask=None):
    """Motion detection on the low-res YUV420 Y channel."""
    global prev_lores

    w, h = LORES_SIZE
    gray = lores_frame[:h, :w]
    gray = cv2.GaussianBlur(gray, (21, 21), 0)

    if prev_lores is None:
        prev_lores = gray
        return False, 0, 0

    delta = cv2.absdiff(prev_lores, gray)
    max_diff = int(delta.max())

    if region_mask is not None:
        delta = cv2.bitwise_and(delta, region_mask)

    thresh = cv2.threshold(delta, config['motion_sensitivity'], 255, cv2.THRESH_BINARY)[1]
    pixels = cv2.countNonZero(thresh)

    prev_lores = gray

    motion = pixels > config['motion_threshold']
    return motion, pixels, max_diff


def monitor_loop():
    """Main monitoring loop — stills only, no video encoding.

    - camera.start() with no encoder (lightweight)
    - Motion detection on lores stream
    - On motion: capture burst of stills
    - Cooldown between bursts to prevent flooding
    """
    global prev_lores, state

    print("Monitor loop starting...", flush=True)
    state['monitoring'] = True

    retry_count = 0
    while not stop_flag.is_set() and retry_count < 3:
        if not init_camera():
            print(f"Camera init failed (retry {retry_count+1}/3)", flush=True)
            retry_count += 1
            time.sleep(2)
            continue

        try:
            camera.start()
            time.sleep(0.5)
            camera.set_controls(get_camera_controls())
            time.sleep(0.3)

            prev_lores = None
            print("Monitoring active (stills-only mode)", flush=True)
            retry_count = 0

            region_mask = build_region_mask()
            cooldown_until = 0
            last_heartbeat = time.time()
            last_stats_log = time.time()
            peak_pixels = 0
            peak_max_diff = 0
            frame_count = 0

            while not stop_flag.is_set():
                try:
                    current_time = time.time()

                    # Heartbeat log every 5 minutes so we know the loop is alive
                    if current_time - last_heartbeat >= 300:
                        print(f"[heartbeat] Monitor alive, events={len(motion_events)}", flush=True)
                        last_heartbeat = current_time

                    # Motion stats log every 30 seconds
                    if current_time - last_stats_log >= 30:
                        thresh = config['motion_threshold']
                        sens = config['motion_sensitivity']
                        print(f"[stats] frames={frame_count} peak_px={peak_pixels}/{thresh} peak_diff={peak_max_diff}/{sens} regions={'on' if region_mask is not None else 'off'}", flush=True)
                        last_stats_log = current_time
                        peak_pixels = 0
                        peak_max_diff = 0
                        frame_count = 0

                    # Cooldown after burst
                    if current_time < cooldown_until:
                        time.sleep(0.2)
                        continue

                    # Grab lores frame for motion detection
                    lores_frame = camera.capture_array("lores")
                    motion, pixels, max_diff = detect_motion_lores(lores_frame, region_mask)
                    frame_count += 1
                    peak_pixels = max(peak_pixels, pixels)
                    peak_max_diff = max(peak_max_diff, max_diff)

                    if motion:
                        state['motion_detected'] = True
                        print(f"Motion: {pixels} px (max_diff={max_diff})", flush=True)
                        save_event(pixels)

                        if config.get('capture_on_motion', True):
                            state['capturing'] = True
                            capture_burst()  # capture_burst handles its own camera_lock
                            state['capturing'] = False

                            cooldown = config.get('cooldown_seconds', 5)
                            cooldown_until = time.time() + cooldown
                            prev_lores = None  # Reset motion baseline
                    else:
                        state['motion_detected'] = False

                    time.sleep(0.05)  # ~20 checks/sec

                except Exception as e:
                    print(f"Frame error: {e}", flush=True)
                    time.sleep(1)

        except Exception as e:
            print(f"Monitor error: {e}", flush=True)
            retry_count += 1

        finally:
            try:
                camera.stop()
            except:
                pass

        if not stop_flag.is_set():
            print(f"Restarting monitor (attempt {retry_count+1})", flush=True)
            time.sleep(1)

    state['monitoring'] = False
    state['capturing'] = False
    print("Monitoring stopped", flush=True)


# === WEB ROUTES ===

@app.route('/')
def serve_index():
    return send_from_directory(BASE_DIR / 'web', 'index.html')

@app.route('/<path:filename>')
def serve_static(filename):
    return send_from_directory(BASE_DIR / 'web', filename)


# === API ROUTES ===

@app.route('/api/status')
def api_status():
    return jsonify(state)


@app.route('/api/config', methods=['GET', 'PUT', 'POST'])
def api_config():
    global monitor_thread

    if request.method == 'GET':
        return jsonify(config)

    data = request.get_json(silent=True) or {}

    regions_changed = 'detection_regions' in data or 'use_regions' in data

    for k, v in data.items():
        if k in config:
            config[k] = v
    save_config()

    if regions_changed and state['monitoring']:
        print("[API] Regions changed, restarting monitor", flush=True)
        stop_flag.set()
        if monitor_thread and monitor_thread.is_alive():
            monitor_thread.join(timeout=10)
        # Ensure old thread is dead
        if monitor_thread and monitor_thread.is_alive():
            print("[API] WARNING: old monitor thread still alive", flush=True)
        time.sleep(1)
        stop_flag.clear()
        state['monitoring'] = True
        monitor_thread = threading.Thread(target=monitor_loop, daemon=True)
        monitor_thread.start()
        time.sleep(1)  # Let it initialize
        print("[API] Monitor restarted with new mask", flush=True)

    return jsonify({'success': True, 'config': config})


@app.route('/api/monitoring/start', methods=['POST'])
def api_start():
    global state, monitor_thread

    print("[API] Start request", flush=True)

    if state['monitoring']:
        return jsonify({'success': True, 'status': state})

    stop_flag.clear()
    state['monitoring'] = True
    monitor_thread = threading.Thread(target=monitor_loop, daemon=True)
    monitor_thread.start()
    time.sleep(0.5)

    return jsonify({'success': True, 'status': state})


@app.route('/api/monitoring/stop', methods=['POST'])
def api_stop():
    global monitor_thread

    print("[API] Stop request", flush=True)
    stop_flag.set()
    state['monitoring'] = False

    if monitor_thread and monitor_thread.is_alive():
        monitor_thread.join(timeout=5)

    time.sleep(0.5)
    print("[API] Monitoring stopped", flush=True)
    return jsonify({'success': True, 'status': state})


@app.route('/api/snapshot', methods=['POST'])
def api_snapshot():
    """Manual snapshot — capture a burst of stills"""
    if not state['monitoring']:
        return jsonify({'success': False, 'error': 'Start monitoring first'}), 400

    if state['capturing']:
        return jsonify({'success': False, 'error': 'Already capturing'}), 400

    data = request.get_json(silent=True) or {}
    count = data.get('count', config.get('burst_count', 5))

    state['capturing'] = True
    try:
        filenames = capture_burst(count=count)
        return jsonify({'success': True, 'filenames': filenames, 'status': state})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        state['capturing'] = False


@app.route('/api/events')
def api_events():
    return jsonify({'events': motion_events[-50:]})


# Keep /api/recordings for any old MP4s on disk
@app.route('/api/recordings')
def api_recordings():
    recs = []
    for f in sorted(RECORDINGS_DIR.glob('*.mp4'), reverse=True):
        s = f.stat()
        recs.append({
            'filename': f.name,
            'size': s.st_size,
            'created': datetime.fromtimestamp(s.st_ctime).isoformat(),
            'url': f'/api/recordings/{f.name}'
        })
    return jsonify({'recordings': recs})


@app.route('/api/recordings/<filename>', methods=['GET', 'DELETE'])
def api_recording(filename):
    fp = RECORDINGS_DIR / filename

    if request.method == 'DELETE':
        if fp.exists():
            fp.unlink()
            return jsonify({'success': True})
        return jsonify({'error': 'Not found'}), 404

    if not fp.exists():
        return jsonify({'error': 'Not found'}), 404
    return send_from_directory(RECORDINGS_DIR, filename)


@app.route('/api/stills', methods=['GET'])
def api_stills():
    stills = []
    # Recursively glob for JPEGs in all date subfolders
    for f in sorted(STILLS_DIR.glob('**/*.jpg'), reverse=True):
        s = f.stat()
        # Store relative path from STILLS_DIR for the URL
        rel_path = f.relative_to(STILLS_DIR)
        stills.append({
            'filename': f.name,
            'size': s.st_size,
            'created': datetime.fromtimestamp(s.st_ctime).isoformat(),
            'url': f'/api/stills/{rel_path}'
        })
    return jsonify({'stills': stills})


@app.route('/api/stills/<path:filepath>', methods=['GET', 'DELETE'])
def api_still(filepath):
    # Handle paths like "2026-02-08/motion_...jpg"
    fp = STILLS_DIR / filepath

    if request.method == 'DELETE':
        if fp.exists():
            fp.unlink()
            return jsonify({'success': True})
        return jsonify({'error': 'Not found'}), 404

    if not fp.exists():
        return jsonify({'error': 'Not found'}), 404
    return send_from_directory(STILLS_DIR, filepath)


@app.route('/api/stills/all', methods=['DELETE'])
def api_delete_all_stills():
    count = 0
    # Recursively delete from all date subfolders
    for f in STILLS_DIR.glob('**/*.jpg'):
        try:
            f.unlink()
            count += 1
        except:
            pass
    return jsonify({'success': True, 'deleted': count})


@app.route('/api/archive', methods=['POST'])
def api_archive():
    """Archive stills from previous days into dated subfolders"""
    try:
        archived = archive_old_stills()
        return jsonify({'success': True, 'archived': archived})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/preview', methods=['GET'])
def api_preview():
    """Get current camera frame for region drawing (uses frame cache)"""
    global camera

    if not state['monitoring'] or camera is None or not camera.started:
        return jsonify({'error': 'Start monitoring first'}), 400

    try:
        buf = _get_cached_frame()
        return send_file(buf, mimetype='image/jpeg')
    except Exception as e:
        print(f"Preview error: {e}", flush=True)
        return jsonify({'error': str(e)}), 500


@app.route('/api/camera-settings', methods=['GET'])
def api_camera_settings():
    """Return current active profile info (read-only — profiles manage controls)"""
    active = state.get('active_profile', None)
    profile_data = CAMERA_PROFILES.get(active, {}) if active else {}
    return jsonify({
        'active_profile': active,
        'profiles': list(CAMERA_PROFILES.keys()),
        'thresholds': {'day': DAY_THRESHOLD, 'dusk': DUSK_THRESHOLD},
        'current_controls': profile_data
    })


@app.route('/api/calibrate', methods=['POST'])
def api_calibrate():
    """Force immediate profile re-evaluation"""
    data = request.get_json(silent=True) or {}
    force_profile = data.get('force_profile')  # Optional: force a specific profile

    if force_profile and force_profile in CAMERA_PROFILES:
        # Directly apply a forced profile
        try:
            camera.set_controls(CAMERA_PROFILES[force_profile])
            state['active_profile'] = force_profile
            print(f"[calibration] Forced profile -> {force_profile}", flush=True)
            return jsonify({'success': True, 'profile': force_profile, 'forced': True})
        except Exception as e:
            return jsonify({'error': str(e)}), 500

    calibration_trigger.set()
    return jsonify({'success': True, 'message': 'Calibration triggered'})


# ---- Debug endpoints (temporary) ----
@app.route('/api/debug/clear-capturing', methods=['POST'])
def api_debug_clear_capturing():
    """Debug: clear the capturing flag in case it's stuck. Returns new status."""
    state['capturing'] = False
    print('[debug] clearing state["capturing"] flag', flush=True)
    return jsonify({'success': True, 'capturing': state['capturing']})


@app.route('/api/frame')
def api_frame():
    """Get current camera frame as JPEG (pure ISP output, cached)"""
    global camera

    if not state['monitoring'] or camera is None or not camera.started:
        return jsonify({'error': 'Start monitoring first'}), 400

    try:
        buf = _get_cached_frame()
        return send_file(buf, mimetype='image/jpeg')
    except Exception as e:
        print(f"Frame error: {e}", flush=True)
        return jsonify({'error': str(e)}), 500


# === AUTO-CALIBRATION ===

def measure_luminance(frame):
    """Measure mean luminance from a camera frame (BGR from picamera2).
    Convert to YCrCb and take the mean of the Y channel.

    Note: keep for main-frame diagnostics but do NOT use this for profile
    classification — the frame is ISP-processed and can bias AWB/CCM feedback.
    """
    ycrcb = cv2.cvtColor(frame, cv2.COLOR_BGR2YCrCb)
    return float(ycrcb[:, :, 0].mean())


def measure_luminance_lores(lores_frame):
    """Measure mean luminance (Y) from a lores YUV420 frame.

    Use the Y channel directly to avoid ISP/CCM/colour feedback loops.
    """
    h, w = LORES_SIZE[1], LORES_SIZE[0]
    # lores_frame Y plane is in the top 'h' rows and left 'w' columns
    y_plane = lores_frame[:h, :w]
    return float(y_plane.mean())


def auto_calibration_loop():
    """Profile-based auto-calibration.

    Strategy:
    - Measure mean luminance (Y channel, 0-255)
    - Classify scene as DAY / DUSK / NIGHT based on thresholds
    - Apply the matching camera profile (controls are preset, not computed)
    - Only switch when the profile actually changes
    - Runs every 5 minutes, or immediately via /api/calibrate
    """
    print("[calibration] Profile-based auto-calibration started", flush=True)

    # Wait for camera to be ready
    while not calibration_stop.is_set():
        if camera and camera.started:
            break
        calibration_stop.wait(2)

    # Let AE settle
    calibration_stop.wait(10)

    active_profile = None

    while not calibration_stop.is_set():
        try:
            if not camera or not camera.started:
                calibration_stop.wait(10)
                continue

            # Capture one lores frame and measure Y channel to avoid ISP feedback
            # Use capture_array (non-blocking, safe for concurrent use)
            lores = camera.capture_array("lores")
            lum = measure_luminance_lores(lores)

            # Classify scene based on lores luminance
            if lum >= DAY_THRESHOLD:
                profile_name = "DAY"
            elif lum >= DUSK_THRESHOLD:
                profile_name = "DUSK"
            else:
                profile_name = "NIGHT"

            # Only apply if profile changed
            if profile_name != active_profile:
                profile = CAMERA_PROFILES[profile_name]

                print(
                    f"[calibration] Switching profile -> {profile_name} (lum={lum:.0f})",
                    flush=True
                )

                try:
                    # Apply controls under lock to avoid stepping on capture burst
                    with camera_lock:
                        camera.set_controls({"AwbEnable": True})
                    # Small pause to let ISP re-evaluate (outside lock to avoid blocking captures)
                    time.sleep(0.2)
                    with camera_lock:
                        camera.set_controls(profile)
                    active_profile = profile_name
                    state['active_profile'] = profile_name
                except Exception as e:
                    print(f"[calibration] Failed to apply profile: {e}", flush=True)
            else:
                print(
                    f"[calibration] Profile {active_profile} stable (lum={lum:.0f})",
                    flush=True
                )

        except Exception as e:
            print(f"[calibration] Error: {e}", flush=True)

        # Wait or allow forced trigger
        elapsed = 0
        while elapsed < CALIBRATION_INTERVAL_SECONDS:
            if calibration_trigger.is_set():
                calibration_trigger.clear()
                print("[calibration] Forced calibration triggered", flush=True)
                break
            if calibration_stop.is_set():
                break
            calibration_stop.wait(1)
            elapsed += 1

    print("[calibration] Auto-calibration thread stopped", flush=True)


# === MAIN ===

if __name__ == '__main__':
    print("Security Camera API (v6 - Auto-Brightness + Archiving)", flush=True)
    load_config()
    load_events()
    print(f"Config: {config}", flush=True)

    # Archive old stills on startup
    print("Archiving old stills...", flush=True)
    archive_old_stills()

    # Auto-start monitoring on service boot
    print("Auto-starting monitoring...", flush=True)
    stop_flag.clear()
    calibration_stop.clear()
    state['monitoring'] = True
    monitor_thread = threading.Thread(target=monitor_loop, daemon=True)
    monitor_thread.start()

    # Start auto-calibration for brightness/contrast
    calib_thread = threading.Thread(target=auto_calibration_loop, daemon=True)
    calib_thread.start()

    app.run(host='0.0.0.0', port=5000, threaded=True)
