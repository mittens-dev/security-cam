#!/usr/bin/env python3
"""
Raspberry Pi Camera 3 Security System
Simple motion detection with MP4 recording
"""
import sys
import json
import time
import threading
from datetime import datetime
from pathlib import Path
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from picamera2 import Picamera2
from picamera2.encoders import H264Encoder
from picamera2.outputs import FfmpegOutput
import cv2
import numpy as np
import io
from PIL import Image

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
app = Flask(__name__)
CORS(app)

# === STATE ===
config = {
    'motion_threshold': 500,
    'motion_sensitivity': 25,
    'record_on_motion': True,
    'recording_duration': 10,
    'detection_regions': [],  # [[x1,y1,x2,y2], ...]
    'use_regions': False,
    'save_stills': True
}

state = {
    'monitoring': False,
    'recording': False,
    'motion_detected': False,
    'last_motion': None
}

motion_events = []
camera = None
prev_frame = None
stop_flag = threading.Event()
monitor_thread = None


# === CONFIG ===

def load_config():
    global config
    try:
        if CONFIG_FILE.exists():
            with open(CONFIG_FILE) as f:
                config.update(json.load(f))
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
    
    # Keep last 100
    while len(motion_events) > 100:
        motion_events.pop(0)
    
    try:
        with open(EVENTS_FILE, 'w') as f:
            json.dump(motion_events, f)
    except:
        pass


# === CAMERA ===

def init_camera():
    global camera
    if camera is not None:
        try:
            # Check if camera is already working
            camera.capture_array("main")
            return True
        except:
            # Camera exists but failed, close it
            try:
                camera.close()
            except:
                pass
            camera = None
    
    try:
        camera = Picamera2()
        cfg = camera.create_video_configuration(
            main={"size": (1280, 720), "format": "BGR888"}
        )
        camera.configure(cfg)
        print("Camera initialized", flush=True)
        return True
    except Exception as e:
        print(f"Camera init failed: {e}", flush=True)
        camera = None
        return False


def save_still_image(frame):
    """Save still JPEG image when motion detected"""
    if not config.get('save_stills', True):
        return None
    
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"motion_{ts}.jpg"
    filepath = STILLS_DIR / filename
    
    try:
        # Convert BGR to RGB
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        img = Image.fromarray(rgb)
        img.save(filepath, 'JPEG', quality=85)
        print(f"Still saved: {filename}", flush=True)
        return filename
    except Exception as e:
        print(f"Still save error: {e}", flush=True)
        return None


def build_region_mask():
    """Pre-compute region mask for faster detection"""
    if not config.get('use_regions') or not config.get('detection_regions'):
        return None
    
    # Create mask with camera resolution
    mask = np.zeros((720, 1280), dtype=np.uint8)
    for region in config['detection_regions']:
        x1, y1, x2, y2 = region
        mask[y1:y2, x1:x2] = 255
    return mask


def detect_motion(frame, region_mask=None):
    """Frame difference motion detection with optional region masking"""
    global prev_frame
    
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    gray = cv2.GaussianBlur(gray, (21, 21), 0)
    
    if prev_frame is None:
        prev_frame = gray
        return False, 0, 0, None
    
    delta = cv2.absdiff(prev_frame, gray)
    max_diff = int(delta.max())
    
    # Apply pre-computed region mask if provided
    if region_mask is not None:
        delta = cv2.bitwise_and(delta, region_mask)
    
    thresh = cv2.threshold(delta, config['motion_sensitivity'], 255, cv2.THRESH_BINARY)[1]
    pixels = cv2.countNonZero(thresh)
    
    prev_frame = gray
    
    motion = pixels > config['motion_threshold']
    return motion, pixels, max_diff, frame if motion else None


def record_clip(duration):
    """Record MP4 clip using FfmpegOutput"""
    global state
    
    if state['recording']:
        return None
    
    state['recording'] = True
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"motion_{ts}.mp4"
    filepath = RECORDINGS_DIR / filename
    
    print(f"Recording: {filename}", flush=True)
    
    try:
        encoder = H264Encoder(bitrate=4000000)
        output = FfmpegOutput(str(filepath))
        
        camera.start_recording(encoder, output)
        
        # Record for duration
        end_time = time.time() + duration
        while time.time() < end_time:
            if stop_flag.is_set():
                break
            time.sleep(0.5)
        
        camera.stop_recording()
        print(f"Saved: {filename}", flush=True)
        return filename
        
    except Exception as e:
        print(f"Record error: {e}", flush=True)
        try:
            camera.stop_recording()
        except:
            pass
        return None
    finally:
        state['recording'] = False


def monitor_loop():
    """Main loop - capture frames, detect motion, record"""
    global prev_frame, state
    
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
            prev_frame = None
            print("Monitoring active", flush=True)
            retry_count = 0
            
            # Build region mask once at start
            region_mask = build_region_mask()
            
            while not stop_flag.is_set():
                try:
                    frame = camera.capture_array("main")
                    motion, pixels, max_diff, motion_frame = detect_motion(frame, region_mask)
                    
                    if motion:
                        print(f"Motion: {pixels} px", flush=True)
                        
                        # Save still image
                        if motion_frame is not None:
                            save_still_image(motion_frame)
                        
                        save_event(pixels)
                        
                        if config['record_on_motion'] and not state['recording']:
                            record_clip(config['recording_duration'])
                    else:
                        state['motion_detected'] = False
                    
                    time.sleep(0.1)
                except Exception as e:
                    print(f"Frame error: {e}", flush=True)
                    break
        
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
    print("Monitoring stopped", flush=True)


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
    
    # Check if regions changed
    regions_changed = 'detection_regions' in data or 'use_regions' in data
    
    for k, v in data.items():
        if k in config:
            config[k] = v
    save_config()
    
    # If regions changed and monitoring, need to restart to rebuild mask
    if regions_changed and state['monitoring']:
        print("[API] Regions changed, stopping monitor to rebuild mask", flush=True)
        stop_flag.set()
        # Wait for thread to fully exit
        if monitor_thread and monitor_thread.is_alive():
            monitor_thread.join(timeout=2)
        time.sleep(0.5)
        stop_flag.clear()
        state['monitoring'] = True
        # Restart monitoring thread
        monitor_thread = threading.Thread(target=monitor_loop, daemon=True)
        monitor_thread.start()
        print("[API] Monitor restarted with new mask", flush=True)
    
    return jsonify({'success': True, 'config': config})


@app.route('/api/monitoring/start', methods=['POST'])
def api_start():
    global state, monitor_thread
    
    print("[API] Start request", flush=True)
    
    if state['monitoring']:
        print("[API] Already monitoring", flush=True)
        return jsonify({'success': True, 'status': state})
    
    print("[API] Starting thread", flush=True)
    stop_flag.clear()
    state['monitoring'] = True
    monitor_thread = threading.Thread(target=monitor_loop, daemon=True)
    monitor_thread.start()
    time.sleep(0.5)
    print(f"[API] Done, monitoring={state['monitoring']}", flush=True)
    
    return jsonify({'success': True, 'status': state})


@app.route('/api/monitoring/stop', methods=['POST'])
def api_stop():
    global monitor_thread
    
    print("[API] Stop request", flush=True)
    stop_flag.set()
    state['monitoring'] = False
    
    # Wait for thread to fully exit
    if monitor_thread and monitor_thread.is_alive():
        monitor_thread.join(timeout=2)
    
    time.sleep(0.5)
    print("[API] Monitoring stopped", flush=True)
    return jsonify({'success': True, 'status': state})


@app.route('/api/recording/start', methods=['POST'])
def api_record():
    if not state['monitoring']:
        return jsonify({'success': False, 'error': 'Start monitoring first'}), 400
    
    if state['recording']:
        return jsonify({'success': False, 'error': 'Already recording'}), 400
    
    data = request.get_json(silent=True) or {}
    dur = data.get('duration', config['recording_duration'])
    threading.Thread(target=record_clip, args=(dur,), daemon=True).start()
    time.sleep(0.3)
    
    return jsonify({'success': True, 'status': state})


@app.route('/api/recording/stop', methods=['POST'])
def api_stop_record():
    return jsonify({'success': True, 'status': state})


@app.route('/api/events')
def api_events():
    return jsonify({'events': motion_events[-50:]})


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


@app.route('/api/preview', methods=['GET'])
def api_preview():
    """Get current camera frame for region drawing"""
    global camera
    
    # Initialize camera if needed
    if camera is None:
        if not init_camera():
            return jsonify({'error': 'Camera not available'}), 503
    
    try:
        # Start camera if not running
        if not camera.started:
            camera.start()
            time.sleep(0.5)
        
        frame = camera.capture_array("main")
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        img = Image.fromarray(rgb)
        
        buf = io.BytesIO()
        img.save(buf, 'JPEG', quality=85)
        buf.seek(0)
        
        from flask import send_file
        return send_file(buf, mimetype='image/jpeg')
    except Exception as e:
        print(f"Preview error: {e}", flush=True)
        return jsonify({'error': str(e)}), 500


@app.route('/api/stills', methods=['GET'])
def api_stills():
    """List still images"""
    stills = []
    for f in sorted(STILLS_DIR.glob('*.jpg'), reverse=True):
        s = f.stat()
        stills.append({
            'filename': f.name,
            'size': s.st_size,
            'created': datetime.fromtimestamp(s.st_ctime).isoformat(),
            'url': f'/api/stills/{f.name}'
        })
    return jsonify({'stills': stills})


@app.route('/api/stills/<filename>', methods=['GET', 'DELETE'])
def api_still(filename):
    """Get or delete still image"""
    fp = STILLS_DIR / filename
    
    if request.method == 'DELETE':
        if fp.exists():
            fp.unlink()
            return jsonify({'success': True})
        return jsonify({'error': 'Not found'}), 404
    
    if not fp.exists():
        return jsonify({'error': 'Not found'}), 404
    return send_from_directory(STILLS_DIR, filename)


# === MAIN ===

if __name__ == '__main__':
    print("Security Camera API", flush=True)
    load_config()
    load_events()
    print(f"Config: {config}", flush=True)
    app.run(host='0.0.0.0', port=5000, threaded=True)
