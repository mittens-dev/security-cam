// Security Camera Monitor - Stills-Only Frontend

const API_BASE = '/api';

// State
let state = {
    monitoring: false,
    capturing: false,
    config: {}
};

// DOM Elements
const elements = {
    statusDot: document.getElementById('statusDot'),
    statusText: document.getElementById('statusText'),
    startMonitoring: document.getElementById('startMonitoring'),
    stopMonitoring: document.getElementById('stopMonitoring'),
    takeSnapshot: document.getElementById('takeSnapshot'),
    monitoringStatus: document.getElementById('monitoringStatus'),
    capturingStatus: document.getElementById('capturingStatus'),
    motionStatus: document.getElementById('motionStatus'),
    lastMotion: document.getElementById('lastMotion'),
    captureOnMotion: document.getElementById('captureOnMotion'),
    motionThreshold: document.getElementById('motionThreshold'),
    motionSensitivity: document.getElementById('motionSensitivity'),
    burstCount: document.getElementById('burstCount'),
    burstInterval: document.getElementById('burstInterval'),
    cooldownSeconds: document.getElementById('cooldownSeconds'),
    saveConfig: document.getElementById('saveConfig'),
    refreshConfig: document.getElementById('refreshConfig'),
    refreshEvents: document.getElementById('refreshEvents'),
    eventsList: document.getElementById('eventsList'),
    eventsCount: document.getElementById('eventsCount'),
    refreshStills: document.getElementById('refreshStills'),
    deleteAllStills: document.getElementById('deleteAllStills'),
    stillsList: document.getElementById('stillsList'),
    stillsCount: document.getElementById('stillsCount'),
    drawRegions: document.getElementById('drawRegions'),
    clearRegions: document.getElementById('clearRegions'),
    useRegions: document.getElementById('useRegions'),
    regionsCount: document.getElementById('regionsCount'),
    drawCalibrationRegions: document.getElementById('drawCalibrationRegions'),
    clearCalibrationRegions: document.getElementById('clearCalibrationRegions'),
    useCalibrationRegions: document.getElementById('useCalibrationRegions'),
    calibrationRegionsCount: document.getElementById('calibrationRegionsCount'),
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
            headers: { 'Content-Type': 'application/json' }
        };
        if (body) options.body = JSON.stringify(body);

        const response = await fetch(`${API_BASE}${endpoint}`, options);
        const data = await response.json();

        if (!response.ok) throw new Error(data.error || 'Request failed');
        return data;
    } catch (error) {
        console.error('API call failed:', error);
        showAlert(error.message, 'error');
        throw error;
    }
}

async function getStatus() { return await apiCall('/status'); }
async function getConfig() { return await apiCall('/config'); }
async function updateConfig(cfg) { return await apiCall('/config', 'PUT', cfg); }
async function startMonitoringAPI() { return await apiCall('/monitoring/start', 'POST'); }
async function stopMonitoringAPI() { return await apiCall('/monitoring/stop', 'POST'); }
async function takeSnapshotAPI() { return await apiCall('/snapshot', 'POST'); }
async function getEvents() { return await apiCall('/events'); }
async function getStills() { return await apiCall('/stills'); }
async function deleteStill(filename) { return await apiCall(`/stills/${filename}`, 'DELETE'); }
async function deleteAllStillsAPI() { return await apiCall('/stills/all', 'DELETE'); }

// ==================== UI UPDATES ====================

function updateStatusDisplay(status) {
    if (status.monitoring) {
        elements.statusDot.className = 'status-dot active';
        elements.statusText.textContent = 'Active';
    } else {
        elements.statusDot.className = 'status-dot';
        elements.statusText.textContent = 'Inactive';
    }

    if (status.capturing) {
        elements.statusDot.className = 'status-dot recording';
    }

    elements.monitoringStatus.textContent = status.monitoring ? '✓ Active' : '✗ Inactive';
    elements.monitoringStatus.style.color = status.monitoring ? '#48bb78' : '#a0aec0';

    elements.capturingStatus.textContent = status.capturing ? '📸 Capturing...' : '✓ Idle';
    elements.capturingStatus.style.color = status.capturing ? '#f56565' : '#a0aec0';

    elements.motionStatus.textContent = status.motion_detected ? '⚠️ Detected' : '✓ Clear';
    elements.motionStatus.style.color = status.motion_detected ? '#f56565' : '#48bb78';

    if (status.last_motion) {
        elements.lastMotion.textContent = formatDateTime(new Date(status.last_motion));
    } else {
        elements.lastMotion.textContent = 'Never';
    }

    elements.startMonitoring.disabled = status.monitoring;
    elements.stopMonitoring.disabled = !status.monitoring;
    elements.takeSnapshot.disabled = !status.monitoring || status.capturing;
    
    state.monitoring = status.monitoring;
}

function updateConfigDisplay(cfg) {
    elements.captureOnMotion.checked = cfg.capture_on_motion;
    elements.motionThreshold.value = cfg.motion_threshold;
    elements.motionSensitivity.value = cfg.motion_sensitivity;
    elements.burstCount.value = cfg.burst_count || 5;
    elements.burstInterval.value = cfg.burst_interval || 0.5;
    elements.cooldownSeconds.value = cfg.cooldown_seconds || 5;
    
    // Update calibration regions toggle
    if (cfg.use_calibration_regions !== undefined) {
        elements.useCalibrationRegions.checked = cfg.use_calibration_regions;
    }
    
    // Preserve locally-saved zone data if the server returns empty arrays
    // (handles case where API hasn't been restarted with zone support yet)
    const zoneKeys = ['zone_a', 'zone_b', 'zone_c'];
    const preservedZones = {};
    zoneKeys.forEach(k => {
        if (state.config[k]?.length === 4) preservedZones[k] = state.config[k];
    });
    
    // Preserve zone_detection_enabled if server doesn't know about it
    const preservedZoneEnabled = state.config.zone_detection_enabled;
    
    // Merge server config into local (preserves keys not in server response)
    state.config = { ...state.config, ...cfg };
    
    // Restore zone data if server returned empty but we had local data
    zoneKeys.forEach(k => {
        if (preservedZones[k] && (!state.config[k] || state.config[k].length === 0)) {
            state.config[k] = preservedZones[k];
        }
    });
    // Restore zone_detection_enabled if server didn't include it
    if (cfg.zone_detection_enabled === undefined && preservedZoneEnabled !== undefined) {
        state.config.zone_detection_enabled = preservedZoneEnabled;
    }
    
    // Detection mode checkboxes from merged config
    const useRegions = state.config.use_regions || false;
    const zoneEnabled = state.config.zone_detection_enabled || false;
    elements.useRegions.checked = useRegions;
    document.getElementById('zoneDetectionEnabled').checked = zoneEnabled;
    
    // Ensure at least one detection mode is active in the UI
    if (!useRegions && !zoneEnabled) {
        state.config.use_regions = true;
        elements.useRegions.checked = true;
    }
    
    // Update regions count on main page
    const regionCount = state.config.detection_regions?.length || 0;
    elements.regionsCount.textContent = `${regionCount} region${regionCount !== 1 ? 's' : ''} defined`;
    
    // Update calibration regions count on main page
    const calCount = state.config.calibration_regions?.length || 0;
    elements.calibrationRegionsCount.textContent = `${calCount} region${calCount !== 1 ? 's' : ''} defined`;
    
    // Update corner zone status
    updateZoneStatusDisplay();
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
                    <div class="event-details">${event.pixels_changed.toLocaleString()} pixels changed</div>
                </div>
            </div>
        `;
    });
    elements.eventsList.innerHTML = html;
}

function displayStills(stills) {
    if (!stills || stills.length === 0) {
        elements.stillsList.innerHTML = '<p class="no-data">No stills captured</p>';
        elements.stillsCount.textContent = '0 stills';
        return;
    }

    // Sort: corners first, then by date (most recent first)
    const sortedStills = [...stills].sort((a, b) => {
        const aIsCorner = a.filename.startsWith('corner_');
        const bIsCorner = b.filename.startsWith('corner_');
        
        // If types differ, corners come first
        if (aIsCorner !== bIsCorner) {
            return aIsCorner ? -1 : 1;
        }
        
        // Same type, sort by date descending (most recent first)
        return new Date(b.created) - new Date(a.created);
    });

    elements.stillsCount.textContent = `${sortedStills.length} still${sortedStills.length !== 1 ? 's' : ''}`;

    let html = '';
    sortedStills.forEach(still => {
        const date = new Date(still.created);
        const sizeKB = (still.size / 1024).toFixed(0);
        const isCornerDetection = still.filename.startsWith('corner_');
        const badge = isCornerDetection ? '<span class="corner-badge">🎯 Corner</span>' : '';
        
        html += `
            <div class="still-card ${isCornerDetection ? 'corner-still' : ''}" data-filename="${still.filename}">
                <div class="still-thumb" onclick="openLightbox('${still.filename}')">
                    <img src="${still.url}" alt="${still.filename}" loading="lazy" />
                    ${badge}
                </div>
                <div class="still-info">
                    <div class="still-name">${still.filename}</div>
                    <div class="still-details">${formatDateTime(date)} &bull; ${sizeKB} KB</div>
                </div>
                <div class="still-actions">
                    <a href="${still.url}" download class="btn btn-primary btn-small">⬇</a>
                    <button onclick="deleteStillClick('${still.filename}')" class="btn btn-danger btn-small">🗑</button>
                </div>
            </div>
        `;
    });
    elements.stillsList.innerHTML = html;
}

// ==================== LIGHTBOX ====================

function openLightbox(filename) {
    const lightbox = document.getElementById('stillLightbox');
    const img = document.getElementById('lightboxImage');
    const name = document.getElementById('lightboxFilename');
    const dl = document.getElementById('lightboxDownload');

    img.src = `/api/stills/${filename}`;
    name.textContent = filename;
    dl.href = `/api/stills/${filename}`;
    lightbox.style.display = 'flex';

    // Store current filename for delete
    lightbox.dataset.filename = filename;
}

function closeLightbox() {
    document.getElementById('stillLightbox').style.display = 'none';
}

// ==================== EVENT HANDLERS ====================

elements.startMonitoring.addEventListener('click', async () => {
    try {
        const result = await startMonitoringAPI();
        updateStatusDisplay(result.status);
        showAlert('Monitoring started', 'success');
    } catch (e) { console.error(e); }
});

elements.stopMonitoring.addEventListener('click', async () => {
    try {
        const result = await stopMonitoringAPI();
        updateStatusDisplay(result.status);
        showAlert('Monitoring stopped', 'success');
    } catch (e) { console.error(e); }
});

elements.takeSnapshot.addEventListener('click', async () => {
    try {
        elements.takeSnapshot.disabled = true;
        elements.takeSnapshot.textContent = '📸 Capturing...';
        const result = await takeSnapshotAPI();
        updateStatusDisplay(result.status);
        showAlert(`Captured ${result.filenames.length} stills`, 'success');
        setTimeout(loadStills, 500);
    } catch (e) {
        console.error(e);
    } finally {
        elements.takeSnapshot.textContent = '📸 Take Snapshot';
        elements.takeSnapshot.disabled = !state.config.monitoring;
    }
});

elements.saveConfig.addEventListener('click', async () => {
    try {
        const cfg = {
            capture_on_motion: elements.captureOnMotion.checked,
            motion_threshold: parseInt(elements.motionThreshold.value),
            motion_sensitivity: parseInt(elements.motionSensitivity.value),
            burst_count: parseInt(elements.burstCount.value),
            burst_interval: parseFloat(elements.burstInterval.value),
            cooldown_seconds: parseInt(elements.cooldownSeconds.value)
        };
        await updateConfig(cfg);
        showAlert('Settings saved', 'success');
    } catch (e) { console.error(e); }
});

elements.refreshConfig.addEventListener('click', async () => {
    try {
        await loadStatus();
        showAlert('Settings refreshed', 'success');
    } catch (e) { console.error(e); }
});

elements.refreshEvents.addEventListener('click', loadEvents);
elements.refreshStills.addEventListener('click', loadStills);

elements.deleteAllStills.addEventListener('click', async () => {
    if (!confirm('Delete ALL captured stills?')) return;
    try {
        const result = await deleteAllStillsAPI();
        showAlert(`Deleted ${result.deleted} stills`, 'success');
        loadStills();
    } catch (e) { console.error(e); }
});

// ==================== DATA LOADING ====================

async function loadStatus() {
    try {
        const status = await getStatus();
        updateStatusDisplay(status);
        const cfg = await getConfig();
        updateConfigDisplay(cfg);
    } catch (e) { console.error(e); }
}

async function loadEvents() {
    try {
        const data = await getEvents();
        displayEvents(data.events);
    } catch (e) { console.error(e); }
}

async function loadStills() {
    try {
        const data = await getStills();
        displayStills(data.stills);
    } catch (e) { console.error(e); }
}

async function deleteStillClick(filename) {
    if (!confirm(`Delete "${filename}"?`)) return;
    try {
        await deleteStill(filename);
        showAlert('Still deleted', 'success');
        loadStills();
    } catch (e) { console.error(e); }
}
window.deleteStillClick = deleteStillClick;
window.openLightbox = openLightbox;

// ==================== UTILITIES ====================

function formatDateTime(date) {
    return date.toLocaleString('en-US', {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
}

function showAlert(message, type = 'success') {
    const alert = document.createElement('div');
    alert.className = `alert alert-${type}`;
    alert.textContent = message;
    const container = document.querySelector('.container');
    container.insertBefore(alert, container.firstChild);
    setTimeout(() => alert.remove(), 3000);
}

// ==================== REGION DRAWING ====================

let regionDrawing = {
    mode: 'detection', // 'detection' or 'calibration'
    detectionRegions: [],
    calibrationRegions: [],
    currentRegion: null,
    isDrawing: false,
    imageLoaded: false,
    canvasScale: 1,
    baseImage: null,
    selectedRegion: null
};

function getActiveRegions() {
    return regionDrawing.mode === 'detection' 
        ? regionDrawing.detectionRegions 
        : regionDrawing.calibrationRegions;
}

function setActiveRegions(regions) {
    if (regionDrawing.mode === 'detection') {
        regionDrawing.detectionRegions = regions;
    } else {
        regionDrawing.calibrationRegions = regions;
    }
}

async function openRegionDrawing(mode = 'detection') {
    try {
        regionDrawing.mode = mode;
        updateModalMode();

        const response = await fetch(`${API_BASE}/preview`);
        
        if (!response.ok) {
            if (response.status === 400) {
                throw new Error('Start monitoring first to load camera preview');
            } else {
                throw new Error(`Failed to fetch preview (HTTP ${response.status})`);
            }
        }

        const blob = await response.blob();
        const img = new Image();

        img.onload = () => {
            const canvas = elements.regionCanvas;
            const ctx = canvas.getContext('2d');

            const maxWidth = 1200;
            const maxHeight = 800;
            let width = img.width;
            let height = img.height;

            if (width > maxWidth) { height = (maxWidth / width) * height; width = maxWidth; }
            if (height > maxHeight) { width = (maxHeight / height) * width; height = maxHeight; }

            canvas.width = width;
            canvas.height = height;
            regionDrawing.canvasScale = width / img.width;
            regionDrawing.baseImage = img;

            ctx.drawImage(img, 0, 0, width, height);
            regionDrawing.imageLoaded = true;
            regionDrawing.detectionRegions = [...(state.config.detection_regions || [])];
            regionDrawing.calibrationRegions = [...(state.config.calibration_regions || [])];
            regionDrawing.selectedRegion = null;
            updateRegionsList();
            drawRegions();

            elements.regionModal.style.display = 'flex';
        };
        img.src = URL.createObjectURL(blob);
    } catch (e) {
        console.error(e);
        showAlert(e.message || 'Failed to load preview', 'error');
    }
}

function updateModalMode() {
    const title = document.getElementById('regionModalTitle');
    const desc = document.getElementById('regionModalDesc');
    const btnDetection = document.getElementById('btnDetectionMode');
    const btnCalibration = document.getElementById('btnCalibrationMode');

    if (regionDrawing.mode === 'detection') {
        title.textContent = '🎯 Detection Regions';
        desc.textContent = 'Click and drag on the image to draw detection regions. Motion will only be detected inside these zones.';
        btnDetection.classList.add('active');
        btnCalibration.classList.remove('active');
    } else {
        title.textContent = '🔆 Calibration Regions';
        desc.textContent = 'Draw regions to INCLUDE in brightness measurement. Areas outside (like sky) will be excluded from auto-exposure calibration.';
        btnDetection.classList.remove('active');
        btnCalibration.classList.add('active');
    }
}

function drawRegions() {
    if (!regionDrawing.imageLoaded || !regionDrawing.baseImage) return;

    const canvas = elements.regionCanvas;
    const ctx = canvas.getContext('2d');
    const scale = regionDrawing.canvasScale;

    ctx.drawImage(regionDrawing.baseImage, 0, 0, canvas.width, canvas.height);

    const regions = getActiveRegions();
    const isCalibration = regionDrawing.mode === 'calibration';
    const normalColor = isCalibration ? '#00aaff' : '#00ff00'; // Blue for calibration, green for detection
    const normalFill = isCalibration ? 'rgba(0, 170, 255, 0.15)' : 'rgba(0, 255, 0, 0.15)';

    regions.forEach((region, idx) => {
        const [x1, y1, x2, y2] = region;
        const x = x1 * scale, y = y1 * scale;
        const w = (x2 - x1) * scale, h = (y2 - y1) * scale;

        if (idx === regionDrawing.selectedRegion) {
            ctx.strokeStyle = '#ff0000'; ctx.lineWidth = 4;
            ctx.fillStyle = 'rgba(255, 0, 0, 0.2)';
        } else {
            ctx.strokeStyle = normalColor; ctx.lineWidth = 3;
            ctx.fillStyle = normalFill;
        }

        ctx.fillRect(x, y, w, h);
        ctx.strokeRect(x, y, w, h);
        ctx.fillStyle = idx === regionDrawing.selectedRegion ? '#ff0000' : normalColor;
        ctx.font = 'bold 20px sans-serif';
        ctx.fillText(`#${idx + 1}`, x + 5, y + 25);
    });

    if (regionDrawing.currentRegion) {
        ctx.strokeStyle = normalColor; ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        const { startX, startY, endX, endY } = regionDrawing.currentRegion;
        ctx.strokeRect(startX, startY, endX - startX, endY - startY);
        ctx.setLineDash([]);
    }
}

function setupRegionDrawing() {
    const canvas = elements.regionCanvas;
    let startX, startY;

    canvas.addEventListener('mousedown', (e) => {
        if (!regionDrawing.imageLoaded) return;
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        startX = (e.clientX - rect.left) * scaleX;
        startY = (e.clientY - rect.top) * scaleY;
        regionDrawing.isDrawing = true;
        regionDrawing.currentRegion = { startX, startY, endX: startX, endY: startY };
    });

    canvas.addEventListener('mousemove', (e) => {
        if (!regionDrawing.isDrawing) return;
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        regionDrawing.currentRegion.endX = (e.clientX - rect.left) * scaleX;
        regionDrawing.currentRegion.endY = (e.clientY - rect.top) * scaleY;
        drawRegions();
    });

    canvas.addEventListener('mouseup', () => {
        if (!regionDrawing.isDrawing) return;
        regionDrawing.isDrawing = false;

        const { startX, startY, endX, endY } = regionDrawing.currentRegion;
        const scale = regionDrawing.canvasScale;

        const x1 = Math.floor(Math.min(startX, endX) / scale);
        const y1 = Math.floor(Math.min(startY, endY) / scale);
        const x2 = Math.floor(Math.max(startX, endX) / scale);
        const y2 = Math.floor(Math.max(startY, endY) / scale);

        if (Math.abs(x2 - x1) > 5 && Math.abs(y2 - y1) > 5) {
            getActiveRegions().push([x1, y1, x2, y2]);
            updateRegionsCount();
            updateRegionsList();
        }
        regionDrawing.currentRegion = null;
        drawRegions();
    });
}

async function saveRegionsToConfig() {
    try {
        const cfg = {
            detection_regions: regionDrawing.detectionRegions,
            use_regions: elements.useRegions.checked,
            calibration_regions: regionDrawing.calibrationRegions,
            use_calibration_regions: elements.useCalibrationRegions.checked
        };
        const response = await apiCall('/config', 'PUT', cfg);
        if (response) {
            state.config.detection_regions = regionDrawing.detectionRegions;
            state.config.use_regions = elements.useRegions.checked;
            state.config.calibration_regions = regionDrawing.calibrationRegions;
            state.config.use_calibration_regions = elements.useCalibrationRegions.checked;
            
            // Update counts on main page
            const detCount = regionDrawing.detectionRegions.length;
            elements.regionsCount.textContent = `${detCount} region${detCount !== 1 ? 's' : ''} defined`;
            const calCount = regionDrawing.calibrationRegions.length;
            elements.calibrationRegionsCount.textContent = `${calCount} region${calCount !== 1 ? 's' : ''} defined`;
            
            showAlert('Regions saved!', 'success');
            closeRegionModal();
        }
    } catch (e) { console.error(e); }
}

function closeRegionModal() {
    elements.regionModal.style.display = 'none';
    regionDrawing.imageLoaded = false;
    regionDrawing.currentRegion = null;
    regionDrawing.isDrawing = false;
}

function clearAllRegions() {
    const mode = regionDrawing.mode === 'detection' ? 'detection' : 'calibration';
    if (confirm(`Clear all ${mode} regions?`)) {
        setActiveRegions([]);
        regionDrawing.selectedRegion = null;
        updateRegionsCount();
        updateRegionsList();
        drawRegions();
    }
}

function deleteSelectedRegion() {
    if (regionDrawing.selectedRegion !== null) {
        const regions = getActiveRegions();
        regions.splice(regionDrawing.selectedRegion, 1);
        setActiveRegions(regions);
        regionDrawing.selectedRegion = null;
        updateRegionsCount();
        updateRegionsList();
        drawRegions();
    }
}

function updateRegionsCount() {
    if (regionDrawing.mode === 'detection') {
        const count = regionDrawing.detectionRegions.length;
        elements.regionsCount.textContent = `${count} region${count !== 1 ? 's' : ''} defined`;
    } else {
        const count = regionDrawing.calibrationRegions.length;
        elements.calibrationRegionsCount.textContent = `${count} region${count !== 1 ? 's' : ''} defined`;
    }
}

function updateRegionsList() {
    const list = document.getElementById('regionsList');
    const modalCount = document.getElementById('modalRegionsCount');
    const deleteBtn = document.getElementById('deleteSelected');
    const regions = getActiveRegions();

    modalCount.textContent = regions.length;
    list.innerHTML = '';

    if (regions.length === 0) {
        list.innerHTML = '<p class="no-regions">No regions defined</p>';
        deleteBtn.style.display = 'none';
        return;
    }

    regions.forEach((region, idx) => {
        const [x1, y1, x2, y2] = region;
        const div = document.createElement('div');
        div.className = 'region-item';
        if (idx === regionDrawing.selectedRegion) div.classList.add('selected');
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


// ==================== CAMERA SETTINGS ====================

let cameraSettingsPreviewInterval = null;

const NR_MODES = ['Off', 'Minimal', 'Standard', 'High Quality'];

function setupCameraSettingsModal() {
    const openBtn = document.getElementById('openCameraSettings');
    const modal = document.getElementById('cameraModal');
    const closeBtn = document.getElementById('closeCameraSettings');
    const calibrateBtn = document.getElementById('calibrateNow');
    const forceDayBrightBtn = document.getElementById('forceDayBright');
    const forceDayBtn = document.getElementById('forceDay');
    const forceDuskBrightBtn = document.getElementById('forceDuskBright');
    const forceDuskDarkBtn = document.getElementById('forceDuskDark');
    const forceNightBtn = document.getElementById('forceNight');

    if (!openBtn || !modal || !closeBtn || !calibrateBtn) {
        console.error('setupCameraSettingsModal: Missing required elements');
        return;
    }

    async function loadProfileInfo() {
        try {
            const data = await apiCall('/camera-settings', 'GET');
            const profileName = document.getElementById('activeProfileName');
            if (profileName) {
                const name = data.active_profile || 'Detecting...';
                profileName.textContent = name;
                profileName.className = 'profile-badge profile-' + (data.active_profile || '').toLowerCase();
            }
            if (data.current_controls) {
                const c = data.current_controls;
                const el = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };
                el('profileBrightness', c.Brightness?.toFixed(1) ?? '—');
                el('profileContrast', c.Contrast?.toFixed(2) ?? '—');
                el('profileSaturation', c.Saturation?.toFixed(2) ?? '—');
                el('profileSharpness', c.Sharpness?.toFixed(1) ?? '—');
                el('profileNR', NR_MODES[c.NoiseReductionMode] || '—');
            }
            // Display luminance and thresholds
            const el = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };
            if (data.luminance !== null && data.luminance !== undefined) {
                el('sceneLuminance', data.luminance.toFixed(1));
            } else {
                el('sceneLuminance', '—');
            }
            // Debug: show unmasked luminance for comparison
            if (data.luminance_unmasked !== null && data.luminance_unmasked !== undefined) {
                el('sceneLuminanceUnmasked', data.luminance_unmasked.toFixed(1));
            } else {
                el('sceneLuminanceUnmasked', '—');
            }
            el('maskActiveStatus', data.mask_active ? '✓ Active' : '✗ Inactive');
            if (data.thresholds) {
                el('thresholdDayBright', data.thresholds.day_bright?.toFixed(0) ?? '—');
                el('thresholdDay', data.thresholds.day?.toFixed(0) ?? '—');
                el('thresholdDuskBright', data.thresholds.dusk_bright?.toFixed(0) ?? '—');
                el('thresholdDuskDark', data.thresholds.dusk_dark?.toFixed(0) ?? '—');
            }
        } catch (e) {
            console.error('Error loading profile info:', e);
        }
    }

    function startPreview() {
        stopPreview();
        const stillPreview = document.getElementById('stillPreview');
        if (!stillPreview) return;
        // Refresh preview every 2 seconds (using cached frame, no lock contention)
        cameraSettingsPreviewInterval = setInterval(() => {
            stillPreview.src = `/api/frame?t=${Date.now()}`;
            loadProfileInfo(); // Also refresh luminance and profile info
        }, 2000);
    }

    function stopPreview() {
        if (cameraSettingsPreviewInterval) {
            clearInterval(cameraSettingsPreviewInterval);
            cameraSettingsPreviewInterval = null;
        }
    }

    openBtn.addEventListener('click', async () => {
        await loadProfileInfo();
        modal.style.display = 'flex';
        startPreview();
    });

    closeBtn.addEventListener('click', () => { stopPreview(); modal.style.display = 'none'; });

    calibrateBtn.addEventListener('click', async () => {
        calibrateBtn.disabled = true;
        calibrateBtn.textContent = '⚙ Recalibrating...';
        try {
            const result = await fetch('/api/calibrate', { method: 'POST' });
            if (result.ok) {
                showAlert('✓ Calibration triggered', 'success');
                // Refresh profile info after a short delay
                setTimeout(loadProfileInfo, 2000);
            } else {
                showAlert('Failed to trigger calibration', 'error');
            }
        } catch (e) {
            showAlert('Error: ' + e.message, 'error');
        } finally {
            calibrateBtn.disabled = false;
            calibrateBtn.textContent = '⚙ Recalibrate Now';
        }
    });

    async function forceProfile(profileName) {
        try {
            const result = await fetch('/api/calibrate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ force_profile: profileName })
            });
            if (result.ok) {
                showAlert(`Forced profile: ${profileName}`, 'success');
                await loadProfileInfo();
            } else {
                showAlert('Failed to force profile', 'error');
            }
        } catch (e) {
            showAlert('Error: ' + e.message, 'error');
        }
    }

    if (forceDayBrightBtn) forceDayBrightBtn.addEventListener('click', () => forceProfile('DAY_BRIGHT'));
    if (forceDayBtn) forceDayBtn.addEventListener('click', () => forceProfile('DAY'));
    if (forceDuskBrightBtn) forceDuskBrightBtn.addEventListener('click', () => forceProfile('DUSK_BRIGHT'));
    if (forceDuskDarkBtn) forceDuskDarkBtn.addEventListener('click', () => forceProfile('DUSK_DARK'));
    if (forceNightBtn) forceNightBtn.addEventListener('click', () => forceProfile('NIGHT'));

    modal.addEventListener('click', (e) => {
        if (e.target === modal) { stopPreview(); modal.style.display = 'none'; }
    });
}

// ==================== LIGHTBOX SETUP ====================

function setupLightbox() {
    const lightbox = document.getElementById('stillLightbox');
    const closeBtn = document.getElementById('lightboxCloseBtn');
    const overlay = document.getElementById('lightboxClose');
    const deleteBtn = document.getElementById('lightboxDelete');

    if (closeBtn) closeBtn.addEventListener('click', closeLightbox);
    if (overlay) overlay.addEventListener('click', closeLightbox);
    if (deleteBtn) {
        deleteBtn.addEventListener('click', async () => {
            const filename = lightbox.dataset.filename;
            if (filename && confirm(`Delete "${filename}"?`)) {
                await deleteStill(filename);
                closeLightbox();
                loadStills();
                showAlert('Still deleted', 'success');
            }
        });
    }

    // Close lightbox with Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && lightbox.style.display === 'flex') {
            closeLightbox();
        }
    });
}

// ==================== CORNER ZONE DRAWING ====================

const cornerZoneDrawing = {
    imageLoaded: false,
    baseImage: null,
    canvasScale: 1,
    isDrawing: false,
    currentZone: 'a', // 'a', 'b', or 'c'
    currentRect: null,
    zones: { a: null, b: null, c: null }
};

async function getZoneStatus() {
    try {
        return await apiCall('/zone-status');
    } catch (e) {
        console.error('Failed to get zone status:', e);
        return null;
    }
}

async function openCornerZoneDrawing() {
    try {
        const response = await fetch(`${API_BASE}/preview`);
        
        if (!response.ok) {
            if (response.status === 400) {
                throw new Error('Start monitoring first to load camera preview');
            } else {
                throw new Error(`Failed to fetch preview (HTTP ${response.status})`);
            }
        }

        const blob = await response.blob();
        const img = new Image();

        img.onload = () => {
            const canvas = document.getElementById('cornerZoneCanvas');
            const ctx = canvas.getContext('2d');

            const maxWidth = 1200;
            const maxHeight = 800;
            let width = img.width;
            let height = img.height;

            if (width > maxWidth) { height = (maxWidth / width) * height; width = maxWidth; }
            if (height > maxHeight) { width = (maxHeight / height) * width; height = maxHeight; }

            canvas.width = width;
            canvas.height = height;
            cornerZoneDrawing.canvasScale = width / img.width;
            cornerZoneDrawing.baseImage = img;

            ctx.drawImage(img, 0, 0, width, height);
            cornerZoneDrawing.imageLoaded = true;
            
            // Load existing zones from config
            cornerZoneDrawing.zones.a = state.config.zone_a?.length === 4 ? state.config.zone_a : null;
            cornerZoneDrawing.zones.b = state.config.zone_b?.length === 4 ? state.config.zone_b : null;
            cornerZoneDrawing.zones.c = state.config.zone_c?.length === 4 ? state.config.zone_c : null;
            
            updateCornerZoneDisplay();
            drawCornerZones();

            document.getElementById('cornerZoneModal').style.display = 'flex';
        };
        img.src = URL.createObjectURL(blob);
    } catch (e) {
        console.error(e);
        showAlert(e.message || 'Failed to load preview', 'error');
    }
}

function setCurrentZone(zone) {
    cornerZoneDrawing.currentZone = zone;
    document.querySelectorAll('.zone-step-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.zone === zone);
    });
    const indicator = document.getElementById('currentZoneIndicator');
    indicator.textContent = zone.toUpperCase();
    indicator.className = `zone-badge zone-${zone}`;
}

function drawCornerZones() {
    if (!cornerZoneDrawing.imageLoaded || !cornerZoneDrawing.baseImage) return;

    const canvas = document.getElementById('cornerZoneCanvas');
    const ctx = canvas.getContext('2d');
    const scale = cornerZoneDrawing.canvasScale;

    ctx.drawImage(cornerZoneDrawing.baseImage, 0, 0, canvas.width, canvas.height);

    const zoneColors = {
        a: { stroke: '#00ff00', fill: 'rgba(0, 255, 0, 0.2)', label: 'A' },
        b: { stroke: '#ffaa00', fill: 'rgba(255, 170, 0, 0.2)', label: 'B' },
        c: { stroke: '#ff0000', fill: 'rgba(255, 0, 0, 0.2)', label: 'C' }
    };

    // Draw existing zones
    ['a', 'b', 'c'].forEach(zone => {
        const coords = cornerZoneDrawing.zones[zone];
        if (coords && coords.length === 4) {
            const [x1, y1, x2, y2] = coords;
            const x = x1 * scale, y = y1 * scale;
            const w = (x2 - x1) * scale, h = (y2 - y1) * scale;

            const color = zoneColors[zone];
            ctx.strokeStyle = color.stroke;
            ctx.lineWidth = 3;
            ctx.fillStyle = color.fill;

            ctx.fillRect(x, y, w, h);
            ctx.strokeRect(x, y, w, h);
            ctx.fillStyle = color.stroke;
            ctx.font = 'bold 24px sans-serif';
            ctx.fillText(color.label, x + 10, y + 30);
        }
    });

    // Draw current drawing rectangle
    if (cornerZoneDrawing.currentRect) {
        const color = zoneColors[cornerZoneDrawing.currentZone];
        ctx.strokeStyle = color.stroke;
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        const { startX, startY, endX, endY } = cornerZoneDrawing.currentRect;
        ctx.strokeRect(startX, startY, endX - startX, endY - startY);
        ctx.setLineDash([]);
    }
}

function setupCornerZoneDrawing() {
    const canvas = document.getElementById('cornerZoneCanvas');
    let startX, startY;

    canvas.addEventListener('mousedown', (e) => {
        if (!cornerZoneDrawing.imageLoaded) return;
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        startX = (e.clientX - rect.left) * scaleX;
        startY = (e.clientY - rect.top) * scaleY;
        cornerZoneDrawing.isDrawing = true;
        cornerZoneDrawing.currentRect = { startX, startY, endX: startX, endY: startY };
    });

    canvas.addEventListener('mousemove', (e) => {
        if (!cornerZoneDrawing.isDrawing) return;
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        cornerZoneDrawing.currentRect.endX = (e.clientX - rect.left) * scaleX;
        cornerZoneDrawing.currentRect.endY = (e.clientY - rect.top) * scaleY;
        drawCornerZones();
    });

    canvas.addEventListener('mouseup', () => {
        if (!cornerZoneDrawing.isDrawing) return;
        cornerZoneDrawing.isDrawing = false;

        const { startX, startY, endX, endY } = cornerZoneDrawing.currentRect;
        const scale = cornerZoneDrawing.canvasScale;

        const x1 = Math.floor(Math.min(startX, endX) / scale);
        const y1 = Math.floor(Math.min(startY, endY) / scale);
        const x2 = Math.floor(Math.max(startX, endX) / scale);
        const y2 = Math.floor(Math.max(startY, endY) / scale);

        if (Math.abs(x2 - x1) > 5 && Math.abs(y2 - y1) > 5) {
            cornerZoneDrawing.zones[cornerZoneDrawing.currentZone] = [x1, y1, x2, y2];
            updateCornerZoneDisplay();
            
            // Auto-advance to next zone
            if (cornerZoneDrawing.currentZone === 'a') {
                setCurrentZone('b');
            } else if (cornerZoneDrawing.currentZone === 'b') {
                setCurrentZone('c');
            }
        }
        
        cornerZoneDrawing.currentRect = null;
        drawCornerZones();
    });

    // Zone selection buttons
    document.getElementById('drawZoneA').addEventListener('click', () => setCurrentZone('a'));
    document.getElementById('drawZoneB').addEventListener('click', () => setCurrentZone('b'));
    document.getElementById('drawZoneC').addEventListener('click', () => setCurrentZone('c'));

    // Clear zone buttons
    document.querySelectorAll('.btn-clear-zone').forEach(btn => {
        btn.addEventListener('click', () => {
            const zone = btn.dataset.zone;
            cornerZoneDrawing.zones[zone] = null;
            updateCornerZoneDisplay();
            drawCornerZones();
        });
    });

    // Save and cancel
    document.getElementById('saveCornerZones').addEventListener('click', saveCornerZonesToConfig);
    document.getElementById('cancelCornerZones').addEventListener('click', closeCornerZoneModal);
}

function updateCornerZoneDisplay() {
    ['a', 'b', 'c'].forEach(zone => {
        const coords = cornerZoneDrawing.zones[zone];
        const coordsEl = document.getElementById(`zone${zone.toUpperCase()}Coords`);
        if (coords && coords.length === 4) {
            coordsEl.textContent = `[${coords[0]}, ${coords[1]}, ${coords[2]}, ${coords[3]}]`;
            coordsEl.style.color = '#48bb78';
        } else {
            coordsEl.textContent = 'Not defined';
            coordsEl.style.color = '#a0aec0';
        }
    });
}

async function saveCornerZonesToConfig() {
    try {
        const frameInterval = parseFloat(document.getElementById('zoneFrameInterval').value) || 0.15;
        const cycleDuration = parseFloat(document.getElementById('zoneCycleDuration').value) || 5.0;
        
        const cfg = {
            zone_a: cornerZoneDrawing.zones.a || [],
            zone_b: cornerZoneDrawing.zones.b || [],
            zone_c: cornerZoneDrawing.zones.c || [],
            zone_frame_interval: frameInterval,
            zone_cycle_duration: cycleDuration
        };
        
        const response = await apiCall('/config', 'PUT', cfg);
        if (response) {
            state.config = { ...state.config, ...cfg };
            updateZoneStatusDisplay();
            updateDetectionModeHighlight();
            showAlert('Corner zones saved!', 'success');
            closeCornerZoneModal();
        }
    } catch (e) {
        console.error(e);
        showAlert('Failed to save zones', 'error');
    }
}

function closeCornerZoneModal() {
    document.getElementById('cornerZoneModal').style.display = 'none';
    cornerZoneDrawing.imageLoaded = false;
    cornerZoneDrawing.currentRect = null;
    cornerZoneDrawing.isDrawing = false;
}

function clearAllCornerZones() {
    if (confirm('Clear all corner detection zones?')) {
        cornerZoneDrawing.zones = { a: null, b: null, c: null };
        // Save clearance to server
        apiCall('/config', 'PUT', { zone_a: [], zone_b: [], zone_c: [] }).then(() => {
            state.config.zone_a = [];
            state.config.zone_b = [];
            state.config.zone_c = [];
            updateZoneStatusDisplay();
            showAlert('Corner zones cleared', 'success');
        });
        // Update modal display if open
        if (cornerZoneDrawing.imageLoaded) {
            updateCornerZoneDisplay();
            drawCornerZones();
        }
    }
}

function updateZoneStatusDisplay() {
    // Zone defined/not-defined badges on main page
    const zoneA = state.config.zone_a;
    const zoneB = state.config.zone_b;
    const zoneC = state.config.zone_c;
    
    document.getElementById('zoneAStatus').textContent = zoneA?.length === 4 ? 'Defined ✓' : 'Not defined';
    document.getElementById('zoneBStatus').textContent = zoneB?.length === 4 ? 'Defined ✓' : 'Not defined';
    document.getElementById('zoneCStatus').textContent = zoneC?.length === 4 ? 'Defined ✓' : 'Not defined';
    
    document.getElementById('zoneABadge').style.opacity = zoneA?.length === 4 ? '1' : '0.5';
    document.getElementById('zoneBBadge').style.opacity = zoneB?.length === 4 ? '1' : '0.5';
    document.getElementById('zoneCBadge').style.opacity = zoneC?.length === 4 ? '1' : '0.5';
    
    if (state.config.zone_frame_interval !== undefined) {
        document.getElementById('zoneFrameInterval').value = state.config.zone_frame_interval;
    }
    if (state.config.zone_cycle_duration !== undefined) {
        document.getElementById('zoneCycleDuration').value = state.config.zone_cycle_duration;
    }
    
    updateDetectionModeHighlight();
    
    // Show/hide live status
    const liveStatus = document.getElementById('zoneLiveStatus');
    const zoneEnabled = state.config.zone_detection_enabled || false;
    if (zoneEnabled && state.monitoring) {
        liveStatus.style.display = 'block';
        updateLiveZoneStatus();
    } else {
        liveStatus.style.display = 'none';
    }
}

function updateDetectionModeHighlight() {
    const regionsLabel = document.querySelector('#useRegions')?.closest('.detection-mode-label');
    const zonesLabel = document.querySelector('#zoneDetectionEnabled')?.closest('.detection-mode-label');
    
    if (regionsLabel) {
        regionsLabel.classList.toggle('active-mode', state.config.use_regions || false);
    }
    if (zonesLabel) {
        zonesLabel.classList.toggle('active-mode', state.config.zone_detection_enabled || false);
    }
}

async function updateLiveZoneStatus() {
    const zoneStatus = await getZoneStatus();
    if (!zoneStatus) return;
    
    document.getElementById('zoneATagged').textContent = zoneStatus.zone_a_tagged ? '✓ Tagged' : '○ Waiting';
    document.getElementById('zoneBTagged').textContent = zoneStatus.zone_b_tagged ? '✓ Tagged' : '○ Waiting';
    document.getElementById('zoneCTagged').textContent = zoneStatus.zone_c_tagged ? '✓ Tagged' : '○ Waiting';
    
    document.getElementById('zoneATagged').style.color = zoneStatus.zone_a_tagged ? '#48bb78' : '#a0aec0';
    document.getElementById('zoneBTagged').style.color = zoneStatus.zone_b_tagged ? '#48bb78' : '#a0aec0';
    document.getElementById('zoneCTagged').style.color = zoneStatus.zone_c_tagged ? '#48bb78' : '#a0aec0';
    
    if (zoneStatus.cycle_active) {
        const elapsed = Math.floor(zoneStatus.cycle_elapsed);
        const total = zoneStatus.cycle_duration || 5;
        document.getElementById('zoneCycleStatus').textContent = `Active (${elapsed}/${total}s)`;
        document.getElementById('zoneCycleStatus').style.color = '#ffa500';
    } else {
        document.getElementById('zoneCycleStatus').textContent = 'Idle';
        document.getElementById('zoneCycleStatus').style.color = '#a0aec0';
    }
}

// ==================== EVENT LISTENERS ====================

function setupEventListeners() {
    if (elements.drawRegions) elements.drawRegions.addEventListener('click', () => openRegionDrawing('detection'));
    if (elements.clearRegions) elements.clearRegions.addEventListener('click', clearAllRegions);
    if (elements.drawCalibrationRegions) elements.drawCalibrationRegions.addEventListener('click', () => openRegionDrawing('calibration'));
    if (elements.clearCalibrationRegions) elements.clearCalibrationRegions.addEventListener('click', clearAllRegions);
    if (elements.saveRegions) elements.saveRegions.addEventListener('click', saveRegionsToConfig);
    if (elements.cancelRegions) elements.cancelRegions.addEventListener('click', closeRegionModal);

    const deleteSelectedBtn = document.getElementById('deleteSelected');
    if (deleteSelectedBtn) deleteSelectedBtn.addEventListener('click', deleteSelectedRegion);

    // Mode toggle buttons in modal
    const btnDetection = document.getElementById('btnDetectionMode');
    const btnCalibration = document.getElementById('btnCalibrationMode');
    if (btnDetection) btnDetection.addEventListener('click', () => {
        regionDrawing.mode = 'detection';
        regionDrawing.selectedRegion = null;
        updateModalMode();
        updateRegionsList();
        drawRegions();
    });
    if (btnCalibration) btnCalibration.addEventListener('click', () => {
        regionDrawing.mode = 'calibration';
        regionDrawing.selectedRegion = null;
        updateModalMode();
        updateRegionsList();
        drawRegions();
    });

    if (elements.useRegions) {
        elements.useRegions.addEventListener('change', async () => {
            const checked = elements.useRegions.checked;
            // OR toggle: if enabling regions, disable corner detection
            if (checked) {
                document.getElementById('zoneDetectionEnabled').checked = false;
                await apiCall('/config', 'PUT', { use_regions: true, zone_detection_enabled: false });
                state.config.use_regions = true;
                state.config.zone_detection_enabled = false;
            } else {
                // Can't have both off - switch to corner detection
                document.getElementById('zoneDetectionEnabled').checked = true;
                await apiCall('/config', 'PUT', { use_regions: false, zone_detection_enabled: true });
                state.config.use_regions = false;
                state.config.zone_detection_enabled = true;
            }
            updateDetectionModeHighlight();
            updateZoneStatusDisplay();
        });
    }

    if (elements.useCalibrationRegions) {
        elements.useCalibrationRegions.addEventListener('change', async () => {
            await apiCall('/config', 'PUT', { use_calibration_regions: elements.useCalibrationRegions.checked });
            state.config.use_calibration_regions = elements.useCalibrationRegions.checked;
        });
    }

    // Corner zone detection
    const drawCornerZonesBtn = document.getElementById('drawCornerZones');
    const clearCornerZonesBtn = document.getElementById('clearCornerZones');
    const zoneDetectionEnabled = document.getElementById('zoneDetectionEnabled');
    const zoneFrameInterval = document.getElementById('zoneFrameInterval');
    const zoneCycleDuration = document.getElementById('zoneCycleDuration');
    
    if (drawCornerZonesBtn) drawCornerZonesBtn.addEventListener('click', openCornerZoneDrawing);
    if (clearCornerZonesBtn) clearCornerZonesBtn.addEventListener('click', clearAllCornerZones);
    
    if (zoneDetectionEnabled) {
        zoneDetectionEnabled.addEventListener('change', async () => {
            const checked = zoneDetectionEnabled.checked;
            // OR toggle: if enabling corner detection, disable regions
            if (checked) {
                elements.useRegions.checked = false;
                await apiCall('/config', 'PUT', { zone_detection_enabled: true, use_regions: false });
                state.config.zone_detection_enabled = true;
                state.config.use_regions = false;
            } else {
                // Can't have both off - switch to region detection
                elements.useRegions.checked = true;
                await apiCall('/config', 'PUT', { zone_detection_enabled: false, use_regions: true });
                state.config.zone_detection_enabled = false;
                state.config.use_regions = true;
            }
            updateDetectionModeHighlight();
            updateZoneStatusDisplay();
        });
    }
    
    if (zoneFrameInterval) {
        zoneFrameInterval.addEventListener('change', async () => {
            const val = parseFloat(zoneFrameInterval.value);
            if (val >= 0.1 && val <= 0.5) {
                await apiCall('/config', 'PUT', { zone_frame_interval: val });
                state.config.zone_frame_interval = val;
            }
        });
    }
    
    if (zoneCycleDuration) {
        zoneCycleDuration.addEventListener('change', async () => {
            const val = parseFloat(zoneCycleDuration.value);
            if (val >= 3 && val <= 10) {
                await apiCall('/config', 'PUT', { zone_cycle_duration: val });
                state.config.zone_cycle_duration = val;
            }
        });
    }

    try { setupCameraSettingsModal(); } catch (e) { console.error(e); }
    try { setupLightbox(); } catch (e) { console.error(e); }
}

// ==================== INITIALIZATION ====================

async function initialize() {
    console.log('Initializing Security Camera Monitor (Stills-Only)...');

    setupEventListeners();
    setupRegionDrawing();
    setupCornerZoneDrawing();

    await loadStatus();
    await loadEvents();
    await loadStills();

    if (state.config.detection_regions) {
        regionDrawing.detectionRegions = state.config.detection_regions;
        const count = regionDrawing.detectionRegions.length;
        elements.regionsCount.textContent = `${count} region${count !== 1 ? 's' : ''} defined`;
    }
    if (state.config.calibration_regions) {
        regionDrawing.calibrationRegions = state.config.calibration_regions;
        const count = regionDrawing.calibrationRegions.length;
        elements.calibrationRegionsCount.textContent = `${count} region${count !== 1 ? 's' : ''} defined`;
    }
    if (state.config.use_calibration_regions !== undefined) {
        elements.useCalibrationRegions.checked = state.config.use_calibration_regions;
    }
    
    // Ensure exactly one detection mode is active
    // Default to normal regions on fresh load (if neither is explicitly set)
    if (!state.config.zone_detection_enabled && !state.config.use_regions) {
        state.config.use_regions = true;
        elements.useRegions.checked = true;
        // Save this default so it persists
        apiCall('/config', 'PUT', { use_regions: true, zone_detection_enabled: false });
    }
    
    // Initialize corner zone display and mode highlight
    updateZoneStatusDisplay();
    updateDetectionModeHighlight();

    // Auto-refresh
    setInterval(loadStatus, 5000);
    setInterval(loadEvents, 10000);
    setInterval(loadStills, 15000);
    
    // Auto-refresh zone status if enabled
    setInterval(() => {
        if (state.config.zone_detection_enabled && state.monitoring) {
            updateLiveZoneStatus();
        }
    }, 2000); // Update every 2 seconds
}

initialize();
