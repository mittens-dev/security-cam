// Security Camera Monitor - Frontend JavaScript

const API_BASE = '/api';

// State
let state = {
    monitoring: false,
    recording: false,
    config: {}
};

// DOM Elements
const elements = {
    statusDot: document.getElementById('statusDot'),
    statusText: document.getElementById('statusText'),
    startMonitoring: document.getElementById('startMonitoring'),
    stopMonitoring: document.getElementById('stopMonitoring'),
    startRecording: document.getElementById('startRecording'),
    stopRecording: document.getElementById('stopRecording'),
    monitoringStatus: document.getElementById('monitoringStatus'),
    recordingStatus: document.getElementById('recordingStatus'),
    motionStatus: document.getElementById('motionStatus'),
    lastMotion: document.getElementById('lastMotion'),
    motionEnabled: document.getElementById('motionEnabled'),
    recordOnMotion: document.getElementById('recordOnMotion'),
    motionThreshold: document.getElementById('motionThreshold'),
    motionSensitivity: document.getElementById('motionSensitivity'),
    recordingDuration: document.getElementById('recordingDuration'),
    saveConfig: document.getElementById('saveConfig'),
    refreshEvents: document.getElementById('refreshEvents'),
    eventsList: document.getElementById('eventsList'),
    eventsCount: document.getElementById('eventsCount'),
    refreshRecordings: document.getElementById('refreshRecordings'),
    recordingsList: document.getElementById('recordingsList'),
    recordingsCount: document.getElementById('recordingsCount')
};

// ==================== API CALLS ====================

async function apiCall(endpoint, method = 'GET', body = null) {
    try {
        const options = {
            method,
            headers: {
                'Content-Type': 'application/json'
            }
        };
        
        if (body) {
            options.body = JSON.stringify(body);
        }
        
        const response = await fetch(`${API_BASE}${endpoint}`, options);
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Request failed');
        }
        
        return data;
    } catch (error) {
        console.error('API call failed:', error);
        showAlert(error.message, 'error');
        throw error;
    }
}

async function getStatus() {
    return await apiCall('/status');
}

async function getConfig() {
    return await apiCall('/config');
}

async function updateConfig(config) {
    return await apiCall('/config', 'PUT', config);
}

async function startMonitoring() {
    return await apiCall('/monitoring/start', 'POST');
}

async function stopMonitoring() {
    return await apiCall('/monitoring/stop', 'POST');
}

async function startRecording() {
    return await apiCall('/recording/start', 'POST');
}

async function stopRecording() {
    return await apiCall('/recording/stop', 'POST');
}

async function getEvents() {
    return await apiCall('/events');
}

async function getRecordings() {
    return await apiCall('/recordings');
}

async function deleteRecording(filename) {
    return await apiCall(`/recordings/${filename}`, 'DELETE');
}

// ==================== UI UPDATES ====================

function updateStatusDisplay(status) {
    // Update status indicator
    if (status.monitoring) {
        elements.statusDot.className = 'status-dot active';
        elements.statusText.textContent = 'Active';
    } else {
        elements.statusDot.className = 'status-dot';
        elements.statusText.textContent = 'Inactive';
    }
    
    if (status.recording) {
        elements.statusDot.className = 'status-dot recording';
    }
    
    // Update info cards
    elements.monitoringStatus.textContent = status.monitoring ? '✓ Active' : '✗ Inactive';
    elements.monitoringStatus.style.color = status.monitoring ? '#48bb78' : '#a0aec0';
    
    elements.recordingStatus.textContent = status.recording ? '⏺ Recording' : '✗ Not Recording';
    elements.recordingStatus.style.color = status.recording ? '#f56565' : '#a0aec0';
    
    elements.motionStatus.textContent = status.motion_detected ? '⚠️ Detected' : '✓ Clear';
    elements.motionStatus.style.color = status.motion_detected ? '#f56565' : '#48bb78';
    
    if (status.last_motion) {
        const date = new Date(status.last_motion);
        elements.lastMotion.textContent = formatDateTime(date);
    } else {
        elements.lastMotion.textContent = 'Never';
    }
    
    // Update button states
    elements.startMonitoring.disabled = status.monitoring;
    elements.stopMonitoring.disabled = !status.monitoring;
    elements.stopRecording.disabled = !status.recording;
}

function updateConfigDisplay(config) {
    // motionEnabled checkbox removed - motion detection is always on when monitoring
    if (elements.motionEnabled) {
        elements.motionEnabled.checked = true;  // Always enabled
    }
    elements.recordOnMotion.checked = config.record_on_motion;
    elements.motionThreshold.value = config.motion_threshold;
    elements.motionSensitivity.value = config.motion_sensitivity;
    elements.recordingDuration.value = config.recording_duration;
    
    state.config = config;
}

function displayEvents(events) {
    if (!events || events.length === 0) {
        elements.eventsList.innerHTML = '<p class="no-data">No motion events recorded</p>';
        elements.eventsCount.textContent = '0 events';
        return;
    }
    
    elements.eventsCount.textContent = `${events.length} event${events.length !== 1 ? 's' : ''}`;
    
    let html = '';
    events.reverse().forEach(event => {
        const date = new Date(event.timestamp);
        html += `
            <div class="event-item">
                <div>
                    <div class="event-time">${formatDateTime(date)}</div>
                    <div class="event-details">
                        ${event.pixels_changed.toLocaleString()} pixels changed
                        (threshold: ${event.threshold})
                    </div>
                </div>
            </div>
        `;
    });
    
    elements.eventsList.innerHTML = html;
}

function displayRecordings(recordings) {
    if (!recordings || recordings.length === 0) {
        elements.recordingsList.innerHTML = '<p class="no-data">No recordings available</p>';
        elements.recordingsCount.textContent = '0 recordings';
        return;
    }
    
    elements.recordingsCount.textContent = `${recordings.length} recording${recordings.length !== 1 ? 's' : ''}`;
    
    let html = '';
    recordings.forEach(rec => {
        const date = new Date(rec.created);
        const sizeMB = (rec.size / (1024 * 1024)).toFixed(2);
        html += `
            <div class="recording-item">
                <div>
                    <div class="recording-name">${rec.filename}</div>
                    <div class="recording-details">
                        ${formatDateTime(date)} • ${sizeMB} MB
                    </div>
                </div>
                <div class="recording-actions">
                    <a href="${rec.url}" download class="btn btn-primary btn-small">
                        ⬇ Download
                    </a>
                    <button onclick="deleteRecordingClick('${rec.filename}')" class="btn btn-danger btn-small">
                        🗑 Delete
                    </button>
                </div>
            </div>
        `;
    });
    
    elements.recordingsList.innerHTML = html;
}

// ==================== EVENT HANDLERS ====================

elements.startMonitoring.addEventListener('click', async () => {
    try {
        const result = await startMonitoring();
        if (result.status) {
            updateStatusDisplay(result.status);
        }
        showAlert('Monitoring started', 'success');
    } catch (error) {
        console.error('Failed to start monitoring:', error);
    }
});

elements.stopMonitoring.addEventListener('click', async () => {
    try {
        const result = await stopMonitoring();
        if (result.status) {
            updateStatusDisplay(result.status);
        }
        showAlert('Monitoring stopped', 'success');
    } catch (error) {
        console.error('Failed to stop monitoring:', error);
    }
});

elements.startRecording.addEventListener('click', async () => {
    try {
        const result = await startRecording();
        if (result.status) {
            updateStatusDisplay(result.status);
        }
        elements.stopRecording.disabled = false;
        showAlert('Recording started', 'success');
    } catch (error) {
        console.error('Failed to start recording:', error);
    }
});

elements.stopRecording.addEventListener('click', async () => {
    try {
        const result = await stopRecording();
        if (result.status) {
            updateStatusDisplay(result.status);
        }
        elements.stopRecording.disabled = true;
        showAlert('Recording stopped', 'success');
        // Refresh recordings list
        setTimeout(loadRecordings, 1000);
    } catch (error) {
        console.error('Failed to stop recording:', error);
    }
});

elements.saveConfig.addEventListener('click', async () => {
    try {
        const config = {
            record_on_motion: elements.recordOnMotion.checked,
            motion_threshold: parseInt(elements.motionThreshold.value),
            motion_sensitivity: parseInt(elements.motionSensitivity.value),
            recording_duration: parseInt(elements.recordingDuration.value)
        };
        
        await updateConfig(config);
        showAlert('Settings saved successfully', 'success');
    } catch (error) {
        console.error('Failed to save config:', error);
    }
});

elements.refreshEvents.addEventListener('click', loadEvents);
elements.refreshRecordings.addEventListener('click', loadRecordings);

// ==================== DATA LOADING ====================

async function loadStatus() {
    try {
        const status = await getStatus();
        updateStatusDisplay(status);
        
        // Load config separately
        const config = await getConfig();
        updateConfigDisplay(config);
    } catch (error) {
        console.error('Failed to load status:', error);
    }
}

async function loadEvents() {
    try {
        const data = await getEvents();
        displayEvents(data.events);
    } catch (error) {
        console.error('Failed to load events:', error);
    }
}

async function loadRecordings() {
    try {
        const data = await getRecordings();
        displayRecordings(data.recordings);
    } catch (error) {
        console.error('Failed to load recordings:', error);
    }
}

async function deleteRecordingClick(filename) {
    if (!confirm(`Delete recording "${filename}"?`)) {
        return;
    }
    
    try {
        await deleteRecording(filename);
        showAlert('Recording deleted', 'success');
        loadRecordings();
    } catch (error) {
        console.error('Failed to delete recording:', error);
    }
}

// Make it globally accessible for onclick
window.deleteRecordingClick = deleteRecordingClick;

// ==================== UTILITIES ====================

function formatDateTime(date) {
    return date.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
}

function showAlert(message, type = 'success') {
    const alert = document.createElement('div');
    alert.className = `alert alert-${type}`;
    alert.textContent = message;
    
    const container = document.querySelector('.container');
    container.insertBefore(alert, container.firstChild);
    
    setTimeout(() => {
        alert.remove();
    }, 3000);
}

// ==================== INITIALIZATION ====================

async function initialize() {
    console.log('Initializing Security Camera Monitor...');
    
    await loadStatus();
    await loadEvents();
    await loadRecordings();
    
    // Auto-refresh every 5 seconds
    setInterval(loadStatus, 5000);
    setInterval(loadEvents, 10000);
}

// Start the app
initialize();
