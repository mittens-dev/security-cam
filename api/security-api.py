#!/usr/bin/env python3
"""
Raspberry Pi Camera 3 Security API
Motion detection with timestamps and recording
"""
import os
import time
import json
import threading
from datetime import datetime
from pathlib import Path
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import cv2
import numpy as np
from picamera2 import Picamera2
from picamera2.encoders import H264Encoder, Quality
from picamera2.outputs import FileOutput
import logging

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app, origins="*", methods=["GET", "PUT", "POST", "OPTIONS", "DELETE"])

# Directories
BASE_DIR = Path(__file__).parent.parent
RECORDINGS_DIR = BASE_DIR / 'recordings'
LOGS_DIR = BASE_DIR / 'logs'
CONFIG_FILE = BASE_DIR / 'api' / 'config.json'
MOTION_LOG_FILE = LOGS_DIR / 'motion_events.json'

# Ensure directories exist
RECORDINGS_DIR.mkdir(exist_ok=True)
LOGS_DIR.mkdir(exist_ok=True)

# ==================== CONFIGURATION ====================

class SecurityConfig:
    """Security system configuration"""
    def __init__(self):
        self.lock = threading.Lock()
        self.load_config()
        
    def load_config(self):
        """Load configuration from file"""
        default_config = {
            'motion_detection_enabled': True,
            'motion_threshold': 500,  # Number of pixels changed
            'motion_sensitivity': 25,  # Difference threshold (0-255)
            'record_on_motion': True,
            'recording_duration': 30,  # seconds
            'continuous_recording': False,
            'resolution': [1920, 1080],
            'framerate': 30,
            'detection_area': None,  # None = full frame
        }
        
        try:
            if CONFIG_FILE.exists():
                with open(CONFIG_FILE, 'r') as f:
                    loaded = json.load(f)
                    default_config.update(loaded)
        except Exception as e:
            logger.error(f"Failed to load config: {e}")
        
        with self.lock:
            for key, value in default_config.items():
                setattr(self, key, value)
    
    def save_config(self):
        """Save configuration to file"""
        with self.lock:
            config_dict = {
                'motion_detection_enabled': self.motion_detection_enabled,
                'motion_threshold': self.motion_threshold,
                'motion_sensitivity': self.motion_sensitivity,
                'record_on_motion': self.record_on_motion,
                'recording_duration': self.recording_duration,
                'continuous_recording': self.continuous_recording,
                'resolution': self.resolution,
                'framerate': self.framerate,
                'detection_area': self.detection_area,
            }
        
        try:
            with open(CONFIG_FILE, 'w') as f:
                json.dump(config_dict, f, indent=2)
            logger.info("Configuration saved")
        except Exception as e:
            logger.error(f"Failed to save config: {e}")
    
    def get_all(self):
        """Get all configuration settings"""
        with self.lock:
            return {
                'motion_detection_enabled': self.motion_detection_enabled,
                'motion_threshold': self.motion_threshold,
                'motion_sensitivity': self.motion_sensitivity,
                'record_on_motion': self.record_on_motion,
                'recording_duration': self.recording_duration,
                'continuous_recording': self.continuous_recording,
                'resolution': self.resolution,
                'framerate': self.framerate,
                'detection_area': self.detection_area,
            }
    
    def update(self, **kwargs):
        """Update configuration settings"""
        with self.lock:
            for key, value in kwargs.items():
                if hasattr(self, key):
                    setattr(self, key, value)
        self.save_config()

# ==================== MOTION DETECTION ====================

class MotionDetector:
    """Motion detection using frame differencing"""
    def __init__(self, config):
        self.config = config
        self.previous_frame = None
        self.motion_detected = False
        self.last_motion_time = None
        self.motion_events = []
        self.lock = threading.Lock()
        self.load_motion_log()
    
    def load_motion_log(self):
        """Load previous motion events"""
        try:
            if MOTION_LOG_FILE.exists():
                with open(MOTION_LOG_FILE, 'r') as f:
                    self.motion_events = json.load(f)
        except Exception as e:
            logger.error(f"Failed to load motion log: {e}")
            self.motion_events = []
    
    def save_motion_event(self, event):
        """Save motion event to log"""
        with self.lock:
            self.motion_events.append(event)
            # Keep only last 1000 events
            if len(self.motion_events) > 1000:
                self.motion_events = self.motion_events[-1000:]
        
        try:
            with open(MOTION_LOG_FILE, 'w') as f:
                json.dump(self.motion_events, f, indent=2)
        except Exception as e:
            logger.error(f"Failed to save motion event: {e}")
    
    def detect(self, frame):
        """Detect motion in frame"""
        if not self.config.motion_detection_enabled:
            return False
        
        # Convert to grayscale
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        gray = cv2.GaussianBlur(gray, (21, 21), 0)
        
        # Initialize previous frame
        if self.previous_frame is None:
            self.previous_frame = gray
            return False
        
        # Calculate difference
        frame_delta = cv2.absdiff(self.previous_frame, gray)
        thresh = cv2.threshold(frame_delta, self.config.motion_sensitivity, 255, cv2.THRESH_BINARY)[1]
        thresh = cv2.dilate(thresh, None, iterations=2)
        
        # Count changed pixels
        changed_pixels = cv2.countNonZero(thresh)
        
        # Update previous frame
        self.previous_frame = gray
        
        # Check if motion detected
        if changed_pixels > self.config.motion_threshold:
            self.motion_detected = True
            self.last_motion_time = datetime.now()
            
            # Log motion event
            event = {
                'timestamp': self.last_motion_time.isoformat(),
                'pixels_changed': int(changed_pixels),
                'threshold': self.config.motion_threshold,
            }
            self.save_motion_event(event)
            logger.info(f"Motion detected: {changed_pixels} pixels changed")
            return True
        
        self.motion_detected = False
        return False
    
    def get_recent_events(self, limit=50):
        """Get recent motion events"""
        with self.lock:
            return self.motion_events[-limit:]

# ==================== CAMERA MANAGER ====================

class CameraManager:
    """Manage Raspberry Pi Camera 3"""
    def __init__(self, config, motion_detector):
        self.config = config
        self.motion_detector = motion_detector
        self.camera = None
        self.recording = False
        self.recording_thread = None
        self.monitoring = False
        self.monitor_thread = None
        self.lock = threading.Lock()
        self.current_recording_file = None
        
    def initialize(self):
        """Initialize camera"""
        try:
            self.camera = Picamera2()
            config = self.camera.create_video_configuration(
                main={"size": tuple(self.config.resolution), "format": "RGB888"}
            )
            self.camera.configure(config)
            self.camera.start()
            logger.info("Camera initialized successfully")
            return True
        except Exception as e:
            logger.error(f"Failed to initialize camera: {e}")
            return False
    
    def stop(self):
        """Stop camera"""
        try:
            if self.camera:
                self.camera.stop()
                self.camera.close()
            logger.info("Camera stopped")
        except Exception as e:
            logger.error(f"Error stopping camera: {e}")
    
    def start_monitoring(self):
        """Start motion detection monitoring"""
        if self.monitoring:
            return True
        
        if not self.camera:
            if not self.initialize():
                return False
        
        self.monitoring = True
        self.monitor_thread = threading.Thread(target=self._monitor_loop, daemon=True)
        self.monitor_thread.start()
        logger.info("Monitoring started")
        return True
    
    def stop_monitoring(self):
        """Stop motion detection monitoring"""
        self.monitoring = False
        if self.monitor_thread:
            self.monitor_thread.join(timeout=5)
        logger.info("Monitoring stopped")
    
    def _monitor_loop(self):
        """Main monitoring loop"""
        while self.monitoring:
            try:
                # Capture frame
                frame = self.camera.capture_array()
                
                # Detect motion
                motion = self.motion_detector.detect(frame)
                
                # Start recording if motion detected
                if motion and self.config.record_on_motion and not self.recording:
                    self.start_recording()
                
                time.sleep(0.1)  # 10 FPS for motion detection
                
            except Exception as e:
                logger.error(f"Error in monitor loop: {e}")
                time.sleep(1)
    
    def start_recording(self, duration=None):
        """Start video recording"""
        if self.recording:
            logger.warning("Already recording")
            return False
        
        if duration is None:
            duration = self.config.recording_duration
        
        self.recording = True
        self.recording_thread = threading.Thread(
            target=self._record_video,
            args=(duration,),
            daemon=True
        )
        self.recording_thread.start()
        return True
    
    def stop_recording(self):
        """Stop video recording"""
        self.recording = False
        if self.recording_thread:
            self.recording_thread.join(timeout=5)
    
    def _record_video(self, duration):
        """Record video for specified duration"""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"motion_{timestamp}.mp4"
        filepath = RECORDINGS_DIR / filename
        
        self.current_recording_file = str(filepath)
        logger.info(f"Starting recording: {filename}")
        
        try:
            # Configure for video recording with lower resolution for performance
            video_config = self.camera.create_video_configuration(
                main={"size": tuple(self.config.resolution), "format": "RGB888"},
                raw={"size": tuple(self.config.resolution)}
            )
            self.camera.configure(video_config)
            self.camera.start()
            
            # Use H264Encoder for better Raspberry Pi compatibility
            encoder = H264Encoder(bitrate=int(4e6), framerate=self.config.framerate)
            output = FileOutput(str(filepath))
            
            self.camera.start_recording(encoder, output)
            
            start_time = time.time()
            while self.recording and (time.time() - start_time) < duration:
                time.sleep(0.1)
            
            self.camera.stop_recording()
            logger.info(f"Recording saved: {filename}")
            
        except Exception as e:
            logger.error(f"Error recording video: {e}")
            import traceback
            logger.error(traceback.format_exc())
            try:
                self.camera.stop_recording()
            except:
                pass
        finally:
            self.recording = False
            self.current_recording_file = None
    
    def get_status(self):
        """Get camera status"""
        return {
            'initialized': self.camera is not None,
            'monitoring': self.monitoring,
            'recording': self.recording,
            'current_file': self.current_recording_file,
            'motion_detected': self.motion_detector.motion_detected,
            'last_motion': self.motion_detector.last_motion_time.isoformat() if self.motion_detector.last_motion_time else None,
        }

# ==================== GLOBAL INSTANCES ====================

config = SecurityConfig()
motion_detector = MotionDetector(config)
camera_manager = CameraManager(config, motion_detector)

# ==================== API ENDPOINTS ====================

@app.route('/api/status', methods=['GET'])
def get_status():
    """Get system status"""
    return jsonify({
        'status': camera_manager.get_status(),
        'config': config.get_all()
    })

@app.route('/api/config', methods=['GET', 'PUT'])
def handle_config():
    """Get or update configuration"""
    if request.method == 'GET':
        return jsonify(config.get_all())
    
    elif request.method == 'PUT':
        try:
            data = request.get_json()
            config.update(**data)
            return jsonify({'success': True, 'config': config.get_all()})
        except Exception as e:
            return jsonify({'success': False, 'error': str(e)}), 400

@app.route('/api/monitoring/start', methods=['POST'])
def start_monitoring():
    """Start motion detection monitoring"""
    if camera_manager.start_monitoring():
        return jsonify({'success': True, 'status': camera_manager.get_status()})
    return jsonify({'success': False, 'error': 'Failed to start monitoring'}), 500

@app.route('/api/monitoring/stop', methods=['POST'])
def stop_monitoring():
    """Stop motion detection monitoring"""
    camera_manager.stop_monitoring()
    return jsonify({'success': True, 'status': camera_manager.get_status()})

@app.route('/api/recording/start', methods=['POST'])
def start_recording():
    """Start manual recording"""
    data = request.get_json() or {}
    duration = data.get('duration', config.recording_duration)
    
    if camera_manager.start_recording(duration):
        return jsonify({'success': True, 'status': camera_manager.get_status()})
    return jsonify({'success': False, 'error': 'Failed to start recording'}), 500

@app.route('/api/recording/stop', methods=['POST'])
def stop_recording():
    """Stop recording"""
    camera_manager.stop_recording()
    return jsonify({'success': True, 'status': camera_manager.get_status()})

@app.route('/api/events', methods=['GET'])
def get_events():
    """Get motion events"""
    limit = request.args.get('limit', 50, type=int)
    events = motion_detector.get_recent_events(limit)
    return jsonify({'events': events})

@app.route('/api/recordings', methods=['GET'])
def list_recordings():
    """List all recordings"""
    try:
        recordings = []
        for file in sorted(RECORDINGS_DIR.glob('*.mp4'), reverse=True):
            stat = file.stat()
            recordings.append({
                'filename': file.name,
                'size': stat.st_size,
                'created': datetime.fromtimestamp(stat.st_ctime).isoformat(),
                'url': f'/api/recordings/{file.name}'
            })
        return jsonify({'recordings': recordings})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/recordings/<filename>', methods=['GET'])
def get_recording(filename):
    """Download recording"""
    return send_from_directory(RECORDINGS_DIR, filename)

@app.route('/api/recordings/<filename>', methods=['DELETE'])
def delete_recording(filename):
    """Delete recording"""
    try:
        filepath = RECORDINGS_DIR / filename
        if filepath.exists():
            filepath.unlink()
            return jsonify({'success': True})
        return jsonify({'success': False, 'error': 'File not found'}), 404
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

# ==================== STARTUP ====================

if __name__ == '__main__':
    logger.info("Starting Security Camera API")
    logger.info(f"Recordings directory: {RECORDINGS_DIR}")
    logger.info(f"Logs directory: {LOGS_DIR}")
    
    # Start monitoring automatically
    if config.motion_detection_enabled:
        camera_manager.start_monitoring()
    
    # Run Flask app
    app.run(host='0.0.0.0', port=5000, debug=False, threaded=True)
