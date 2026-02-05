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
    recordingsCount: document.getElementById('recordingsCount'),
    drawRegions: document.getElementById('drawRegions'),
    clearRegions: document.getElementById('clearRegions'),
    useRegions: document.getElementById('useRegions'),
    regionsCount: document.getElementById('regionsCount'),
    regionModal: document.getElementById('regionModal'),
    regionCanvas: document.getElementById('regionCanvas'),
    saveRegions: document.getElementById('saveRegions'),
    cancelRegions: document.getElementById('cancelRegions')
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
    // motionEnabled checkbox removed - always on when monitoring
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
        updateStatusDisplay(result.status);
        showAlert('Monitoring started', 'success');
    } catch (error) {
        console.error('Failed to start monitoring:', error);
    }
});

elements.stopMonitoring.addEventListener('click', async () => {
    try {
        const result = await stopMonitoring();
        updateStatusDisplay(result.status);
        showAlert('Monitoring stopped', 'success');
    } catch (error) {
        console.error('Failed to stop monitoring:', error);
    }
});

elements.startRecording.addEventListener('click', async () => {
    try {
        const result = await startRecording();
        updateStatusDisplay(result.status);
        elements.stopRecording.disabled = false;
        showAlert('Recording started', 'success');
    } catch (error) {
        console.error('Failed to start recording:', error);
    }
});

elements.stopRecording.addEventListener('click', async () => {
    try {
        const result = await stopRecording();
        updateStatusDisplay(result.status);
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
            motion_detection_enabled: elements.motionEnabled.checked,
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

// Region drawing state
let regionDrawing = {
    regions: [],
    currentRegion: null,
    isDrawing: false,
    imageLoaded: false,
    canvasScale: 1,
    baseImage: null,
    selectedRegion: null
};

// ==================== REGION DRAWING ====================

async function openRegionDrawing() {
    try {
        // Fetch preview image
        const response = await fetch(`${API_BASE}/preview`);
        if (!response.ok) throw new Error('Failed to fetch preview');
        
        const blob = await response.blob();
        const img = new Image();
        
        img.onload = () => {
            // Set canvas size to match image
            const canvas = elements.regionCanvas;
            const ctx = canvas.getContext('2d');
            
            // Scale to fit modal while maintaining aspect ratio
            const maxWidth = 1200;
            const maxHeight = 800;
            let width = img.width;
            let height = img.height;
            
            if (width > maxWidth) {
                height = (maxWidth / width) * height;
                width = maxWidth;
            }
            if (height > maxHeight) {
                width = (maxHeight / height) * width;
                height = maxHeight;
            }
            
            canvas.width = width;
            canvas.height = height;
            regionDrawing.canvasScale = width / img.width;
            regionDrawing.baseImage = img;
            
            // Draw image
            ctx.drawImage(img, 0, 0, width, height);
            regionDrawing.imageLoaded = true;
            
            // Draw existing regions
            regionDrawing.regions = [...(state.config.detection_regions || [])];
            regionDrawing.selectedRegion = null;
            updateRegionsList();
            drawRegions();
            
            // Show modal
            elements.regionModal.style.display = 'flex';
        };
        
        img.src = URL.createObjectURL(blob);
    } catch (error) {
        console.error('Error opening region drawing:', error);
        showMessage('Failed to load preview image', 'error');
    }
}

function drawRegions() {
    if (!regionDrawing.imageLoaded || !regionDrawing.baseImage) return;
    
    const canvas = elements.regionCanvas;
    const ctx = canvas.getContext('2d');
    const scale = regionDrawing.canvasScale;
    
    // Redraw base image
    ctx.drawImage(regionDrawing.baseImage, 0, 0, canvas.width, canvas.height);
    
    // Draw all saved regions
    regionDrawing.regions.forEach((region, idx) => {
        const [x1, y1, x2, y2] = region;
        const x = x1 * scale;
        const y = y1 * scale;
        const w = (x2 - x1) * scale;
        const h = (y2 - y1) * scale;
        
        // Highlight selected region
        if (idx === regionDrawing.selectedRegion) {
            ctx.strokeStyle = '#ff0000';
            ctx.lineWidth = 4;
            ctx.fillStyle = 'rgba(255, 0, 0, 0.2)';
        } else {
            ctx.strokeStyle = '#00ff00';
            ctx.lineWidth = 3;
            ctx.fillStyle = 'rgba(0, 255, 0, 0.15)';
        }
        
        ctx.fillRect(x, y, w, h);
        ctx.strokeRect(x, y, w, h);
        
        // Draw region number
        ctx.fillStyle = idx === regionDrawing.selectedRegion ? '#ff0000' : '#00ff00';
        ctx.font = 'bold 20px sans-serif';
        ctx.fillText(`#${idx + 1}`, x + 5, y + 25);
    });
    
    // Draw current region being drawn
    if (regionDrawing.currentRegion) {
        ctx.strokeStyle = '#00ff00';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        
        const { startX, startY, endX, endY } = regionDrawing.currentRegion;
        const w = endX - startX;
        const h = endY - startY;
        
        ctx.strokeRect(startX, startY, w, h);
        ctx.setLineDash([]);
    }
}

function setupRegionDrawing() {
    const canvas = elements.regionCanvas;
    let startX, startY;
    
    canvas.addEventListener('mousedown', (e) => {
        if (!regionDrawing.imageLoaded) return;
        
        const rect = canvas.getBoundingClientRect();
        startX = e.clientX - rect.left;
        startY = e.clientY - rect.top;
        
        regionDrawing.isDrawing = true;
        regionDrawing.currentRegion = { startX, startY, endX: startX, endY: startY };
    });
    
    canvas.addEventListener('mousemove', (e) => {
        if (!regionDrawing.isDrawing) return;
        
        const rect = canvas.getBoundingClientRect();
        const endX = e.clientX - rect.left;
        const endY = e.clientY - rect.top;
        
        regionDrawing.currentRegion.endX = endX;
        regionDrawing.currentRegion.endY = endY;
        
        // Redraw
        drawRegions();
    });
    
    canvas.addEventListener('mouseup', (e) => {
        if (!regionDrawing.isDrawing) return;
        
        regionDrawing.isDrawing = false;
        
        const { startX, startY, endX, endY } = regionDrawing.currentRegion;
        const scale = regionDrawing.canvasScale;
        
        // Convert canvas coords to image coords
        const x1 = Math.floor(Math.min(startX, endX) / scale);
        const y1 = Math.floor(Math.min(startY, endY) / scale);
        const x2 = Math.floor(Math.max(startX, endX) / scale);
        const y2 = Math.floor(Math.max(startY, endY) / scale);
        
        // Only add if region has size
        if (Math.abs(x2 - x1) > 5 && Math.abs(y2 - y1) > 5) {
            regionDrawing.regions.push([x1, y1, x2, y2]);
            updateRegionsCount();
            updateRegionsList();
        }
        
        regionDrawing.currentRegion = null;
        drawRegions();
    });
}

async function saveRegionsToConfig() {
    try {
        const config = {
            detection_regions: regionDrawing.regions,
            use_regions: elements.useRegions.checked
        };
        
        const response = await apiCall('/config', 'PUT', config);
        if (response) {
            state.config.detection_regions = regionDrawing.regions;
            state.config.use_regions = elements.useRegions.checked;
            showMessage('Detection regions saved successfully!', 'success');
            closeRegionModal();
        }
    } catch (error) {
        console.error('Error saving regions:', error);
        showMessage('Failed to save regions', 'error');
    }
}

function closeRegionModal() {
    elements.regionModal.style.display = 'none';
    regionDrawing.imageLoaded = false;
    regionDrawing.currentRegion = null;
    regionDrawing.isDrawing = false;
}

function clearAllRegions() {
    if (confirm('Clear all detection regions?')) {
        regionDrawing.regions = [];
        regionDrawing.selectedRegion = null;
        updateRegionsCount();
        updateRegionsList();
        drawRegions();
    }
}

function deleteSelectedRegion() {
    if (regionDrawing.selectedRegion !== null) {
        regionDrawing.regions.splice(regionDrawing.selectedRegion, 1);
        regionDrawing.selectedRegion = null;
        updateRegionsCount();
        updateRegionsList();
        drawRegions();
    }
}

function updateRegionsCount() {
    const count = regionDrawing.regions.length;
    elements.regionsCount.textContent = `${count} region${count !== 1 ? 's' : ''} defined`;
}

function updateRegionsList() {
    const list = document.getElementById('regionsList');
    const modalCount = document.getElementById('modalRegionsCount');
    const deleteBtn = document.getElementById('deleteSelected');
    
    modalCount.textContent = regionDrawing.regions.length;
    list.innerHTML = '';
    
    if (regionDrawing.regions.length === 0) {
        list.innerHTML = '<p class="no-regions">No regions defined</p>';
        deleteBtn.style.display = 'none';
        return;
    }
    
    regionDrawing.regions.forEach((region, idx) => {
        const [x1, y1, x2, y2] = region;
        const div = document.createElement('div');
        div.className = 'region-item';
        if (idx === regionDrawing.selectedRegion) {
            div.classList.add('selected');
        }
        div.innerHTML = `
            <span class="region-number">#${idx + 1}</span>
            <span class="region-coords">${x1},${y1} → ${x2},${y2}</span>
            <span class="region-size">${x2-x1}×${y2-y1}</span>
        `;
        div.addEventListener('click', () => {
            if (regionDrawing.selectedRegion === idx) {
                regionDrawing.selectedRegion = null;
                deleteBtn.style.display = 'none';
            } else {
                regionDrawing.selectedRegion = idx;
                deleteBtn.style.display = 'block';
            }
            updateRegionsList();
            drawRegions();
        });
        list.appendChild(div);
    });
    
    deleteBtn.style.display = regionDrawing.selectedRegion !== null ? 'block' : 'none';
}

// ==================== EVENT LISTENERS ====================

function setupEventListeners() {
    // Region controls
    elements.drawRegions.addEventListener('click', openRegionDrawing);
    elements.clearRegions.addEventListener('click', clearAllRegions);
    elements.saveRegions.addEventListener('click', saveRegionsToConfig);
    elements.cancelRegions.addEventListener('click', closeRegionModal);
    document.getElementById('deleteSelected').addEventListener('click', deleteSelectedRegion);
    
    elements.useRegions.addEventListener('change', async () => {
        const config = { use_regions: elements.useRegions.checked };
        await apiCall('/config', 'PUT', config);
        state.config.use_regions = elements.useRegions.checked;
    });
}

async function initialize() {
    console.log('Initializing Security Camera Monitor...');
    
    setupEventListeners();
    setupRegionDrawing();
    
    await loadStatus();
    await loadEvents();
    await loadRecordings();
    
    // Update regions UI
    if (state.config.detection_regions) {
        regionDrawing.regions = state.config.detection_regions;
        updateRegionsCount();
    }
    if (state.config.use_regions !== undefined) {
        elements.useRegions.checked = state.config.use_regions;
    }
    
    // Auto-refresh every 5 seconds
    setInterval(loadStatus, 5000);
    setInterval(loadEvents, 10000);
}

// Start the app
initialize();
