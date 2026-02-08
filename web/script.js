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
}

function updateConfigDisplay(cfg) {
    elements.captureOnMotion.checked = cfg.capture_on_motion;
    elements.motionThreshold.value = cfg.motion_threshold;
    elements.motionSensitivity.value = cfg.motion_sensitivity;
    elements.burstCount.value = cfg.burst_count || 5;
    elements.burstInterval.value = cfg.burst_interval || 0.5;
    elements.cooldownSeconds.value = cfg.cooldown_seconds || 5;
    state.config = cfg;
    
    // Update regions count on main page
    const regionCount = cfg.detection_regions?.length || 0;
    elements.regionsCount.textContent = `${regionCount} region${regionCount !== 1 ? 's' : ''} defined`;
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

    elements.stillsCount.textContent = `${stills.length} still${stills.length !== 1 ? 's' : ''}`;

    let html = '';
    stills.forEach(still => {
        const date = new Date(still.created);
        const sizeKB = (still.size / 1024).toFixed(0);
        html += `
            <div class="still-card" data-filename="${still.filename}">
                <div class="still-thumb" onclick="openLightbox('${still.filename}')">
                    <img src="${still.url}" alt="${still.filename}" loading="lazy" />
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
    regions: [],
    currentRegion: null,
    isDrawing: false,
    imageLoaded: false,
    canvasScale: 1,
    baseImage: null,
    selectedRegion: null
};

async function openRegionDrawing() {
    try {
        const response = await fetch(`${API_BASE}/preview`);
        if (!response.ok) throw new Error('Failed to fetch preview');

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
            regionDrawing.regions = [...(state.config.detection_regions || [])];
            regionDrawing.selectedRegion = null;
            updateRegionsList();
            drawRegions();

            elements.regionModal.style.display = 'flex';
        };
        img.src = URL.createObjectURL(blob);
    } catch (e) {
        console.error(e);
        showAlert('Failed to load preview', 'error');
    }
}

function drawRegions() {
    if (!regionDrawing.imageLoaded || !regionDrawing.baseImage) return;

    const canvas = elements.regionCanvas;
    const ctx = canvas.getContext('2d');
    const scale = regionDrawing.canvasScale;

    ctx.drawImage(regionDrawing.baseImage, 0, 0, canvas.width, canvas.height);

    regionDrawing.regions.forEach((region, idx) => {
        const [x1, y1, x2, y2] = region;
        const x = x1 * scale, y = y1 * scale;
        const w = (x2 - x1) * scale, h = (y2 - y1) * scale;

        if (idx === regionDrawing.selectedRegion) {
            ctx.strokeStyle = '#ff0000'; ctx.lineWidth = 4;
            ctx.fillStyle = 'rgba(255, 0, 0, 0.2)';
        } else {
            ctx.strokeStyle = '#00ff00'; ctx.lineWidth = 3;
            ctx.fillStyle = 'rgba(0, 255, 0, 0.15)';
        }

        ctx.fillRect(x, y, w, h);
        ctx.strokeRect(x, y, w, h);
        ctx.fillStyle = idx === regionDrawing.selectedRegion ? '#ff0000' : '#00ff00';
        ctx.font = 'bold 20px sans-serif';
        ctx.fillText(`#${idx + 1}`, x + 5, y + 25);
    });

    if (regionDrawing.currentRegion) {
        ctx.strokeStyle = '#00ff00'; ctx.lineWidth = 2;
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
        startX = e.clientX - rect.left;
        startY = e.clientY - rect.top;
        regionDrawing.isDrawing = true;
        regionDrawing.currentRegion = { startX, startY, endX: startX, endY: startY };
    });

    canvas.addEventListener('mousemove', (e) => {
        if (!regionDrawing.isDrawing) return;
        const rect = canvas.getBoundingClientRect();
        regionDrawing.currentRegion.endX = e.clientX - rect.left;
        regionDrawing.currentRegion.endY = e.clientY - rect.top;
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
        const cfg = {
            detection_regions: regionDrawing.regions,
            use_regions: elements.useRegions.checked
        };
        const response = await apiCall('/config', 'PUT', cfg);
        if (response) {
            state.config.detection_regions = regionDrawing.regions;
            state.config.use_regions = elements.useRegions.checked;
            // Update regions count on main page
            const regionCount = regionDrawing.regions.length;
            elements.regionsCount.textContent = `${regionCount} region${regionCount !== 1 ? 's' : ''} defined`;
            showAlert('Detection regions saved!', 'success');
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

// ==================== EVENT LISTENERS ====================

function setupEventListeners() {
    if (elements.drawRegions) elements.drawRegions.addEventListener('click', openRegionDrawing);
    if (elements.clearRegions) elements.clearRegions.addEventListener('click', clearAllRegions);
    if (elements.saveRegions) elements.saveRegions.addEventListener('click', saveRegionsToConfig);
    if (elements.cancelRegions) elements.cancelRegions.addEventListener('click', closeRegionModal);

    const deleteSelectedBtn = document.getElementById('deleteSelected');
    if (deleteSelectedBtn) deleteSelectedBtn.addEventListener('click', deleteSelectedRegion);

    if (elements.useRegions) {
        elements.useRegions.addEventListener('change', async () => {
            await apiCall('/config', 'PUT', { use_regions: elements.useRegions.checked });
            state.config.use_regions = elements.useRegions.checked;
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

    await loadStatus();
    await loadEvents();
    await loadStills();

    if (state.config.detection_regions) {
        regionDrawing.regions = state.config.detection_regions;
        updateRegionsCount();
    }
    if (state.config.use_regions !== undefined) {
        elements.useRegions.checked = state.config.use_regions;
    }

    // Auto-refresh
    setInterval(loadStatus, 5000);
    setInterval(loadEvents, 10000);
    setInterval(loadStills, 15000);
}

initialize();
