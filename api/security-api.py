#!/usr/bin/env python3
"""
Raspberry Pi Camera 3 Security System
Simple motion detection with H.264 recording
"""
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

# === PATHS ===
BASE_DIR = Path(__file__).parent.parent
RECORDINGS_DIR = BASE_DIR / 'recordings'
LOGS_DIR = BASE_DIR / 'logs'
CONFIG_FILE = BASE_DIR / 'api' / 'config.json'
EVENTS_FILE = LOGS_DIR / 'motion_events.json'

RECORDINGS_DIR.mkdir(exist_ok=True)
LOGS_DIR.mkdir(exist_ok=True)

# === FLASK APP ===
app = Flask(__name__)
CORS(app)

# === STATE ===
config = {
    'motion_threshold': 500,
    'motion_sensitivity': 25,
    'record_on_motion': True,
    'recording_duration': 10
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


# === CONFIG ===

def load_config():
    global config
    try:
        if CONFIG_FILE.exists():
            with open(CONFIG_FILE) as f:
                config.update(json.load(f))
    except Exception as e:
        print(f"Config error: {e}")


def save_config():
    try:
        with open(CONFIG_FILE, 'w') as f:
            json.dump(config, f, indent=2)
    except Exception as e:
        print(f"Save config error: {e}")


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
        return True
    
    try:
        camera = Picamera2()
        # Simple video config - 720p is plenty for security
        cfg = camera.create_video_configuration(
            main={"size": (1280, 720), "format": "BGR888"}
        )
        camera.configure(cfg)
        print("Camera ready")
        return True
    except Exception as e:
        print(f"Camera init failed: {e}")
        camera = None
        return False


def detect_motion(frame):
    """Frame difference motion detection"""
    global prev_frame
    
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    gray = cv2.GaussianBlur(gray, (21, 21), 0)
    
    if prev_frame is None:
        prev_frame = gray
        return False, 0
    
    delta = cv2.absdiff(prev_frame, gray)
    thresh = cv2.threshold(delta, config['motion_sensitivity'], 255, cv2.THRESH_BINARY)[1]
    pixels = cv2.countNonZero(thresh)
    prev_frame = gray
    
    return pixels > config['motion_threshold'], pixels


def record_clip(duration):
    """Record MP4 clip using FfmpegOutput"""
    global state
    
    if state['recording']:
        return None
    
    state['recording'] = True
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"motion_{ts}.mp4"
    filepath = RECORDINGS_DIR / filename
    
    print(f"Recording: {filename}")
    
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
        print(f"Saved: {filename}")
        return filename
        
    except Exception as e:
        print(f"Record error: {e}")
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
    
    if not init_camera():
        state['monitoring'] = False
        return
    
    camera.start()
    prev_frame = None
    print("Monitoring started")
    
    try:
        while not stop_flag.is_set():
            frame = camera.capture_array("main")
            motion, pixels = detect_motion(frame)
            
            if motion:
                print(f"Motion: {pixels} px")
                save_event(pixels)
                
                if config['record_on_motion'] and not state['recording']:
                    record_clip(config['recording_duration'])
            else:
                state['motion_detected'] = False
            
            time.sleep(0.1)  # ~10 fps
    
    except Exception as e:
        print(f"Monitor error: {e}")
    finally:
        camera.stop()
        state['monitoring'] = False
        print("Monitoring stopped")


# === API ROUTES ===

@app.route('/api/status')
def api_status():
    return jsonify(state)


@app.route('/api/config', methods=['GET', 'PUT'])
def api_config():
    if request.method == 'GET':
        return jsonify(config)
    
    data = request.get_json() or {}
    for k, v in data.items():
        if k in config:
            config[k] = v
    save_config()
    return jsonify({'success': True, 'config': config})


@app.route('/api/monitoring/start', methods=['POST'])
def api_start():
    global state
    
    if state['monitoring']:
        return jsonify({'success': True, 'status': state})
    
    stop_flag.clear()
    state['monitoring'] = True
    threading.Thread(target=monitor_loop, daemon=True).start()
    time.sleep(0.5)
    
    return jsonify({'success': True, 'status': state})


@app.route('/api/monitoring/stop', methods=['POST'])
def api_stop():
    stop_flag.set()
    state['monitoring'] = False
    time.sleep(0.5)
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


# === MAIN ===

if __name__ == '__main__':
    print("Security Camera API")
    load_config()
    load_events()
    print(f"Config: {config}")
    app.run(host='0.0.0.0', port=5000, threaded=True)
