// Motion Detection Security Camera App
class MotionSecurityCamera {
    constructor() {
        this.camera = null;
        this.currentStream = null;
        this.motionDetectionActive = false;
        this.motionCanvas = null;
        this.motionContext = null;
        this.captureCanvas = null;
        this.captureContext = null;
        this.lastFrame = null;
        this.captures = [];
        this.alerts = [];
        this.sensitivity = 30;
        this.captureDelay = 3;
        this.lastCaptureTime = 0;
        this.cooldownPeriod = 5000; // 5 seconds default
        this.sessionCaptures = 0;
        this.startTime = Date.now();
        this.motionThreshold = 2; // percentage
        this.maxStorageImages = 100;
        this.imageQuality = 0.7;
        this.activityData = new Array(24).fill(0);
        
        // Black screen feature properties
        this.blackScreenEnabled = false;
        this.blackScreenActive = false;
        this.tapCount = 0;
        this.tapTimer = null;
        this.textTimer = null;
        
        this.init();
    }

    async init() {
        console.log('Initializing Motion Security Camera...');
        
        try {
            // Setup canvases first
            this.setupCanvases();
            
            // Setup event listeners
            this.setupEventListeners();
            
            // Setup black screen listeners
            this.setupBlackScreenListeners();
            
            // Load saved data
            this.loadSavedData();
            
            // Initialize camera with back-facing preference
            await this.initCamera();
            
            // Update UI
            this.updateUI();
            
            // Start time update
            this.startTimeUpdate();
            
            // Request notification permission
            this.requestNotificationPermission();
            
            // Setup activity tracking
            this.startActivityTracking();
            
            console.log('Initialization complete');
        } catch (error) {
            console.error('Initialization error:', error);
            this.showToast('Initialization error: ' + error.message, 'error');
        }
    }

    setupBlackScreenListeners() {
        const overlay = document.getElementById('blackScreenOverlay');
        const textElement = document.getElementById('blackScreenText');
        
        if (!overlay) return;
        
        // Handle taps on black screen
        overlay.addEventListener('click', (e) => {
            if (!this.blackScreenActive) return;
            
            // Clear previous timer
            if (this.tapTimer) {
                clearTimeout(this.tapTimer);
            }
            
            this.tapCount++;
            
            if (this.tapCount === 1) {
                // Single tap - show instructions
                textElement.style.display = 'block';
                
                // Hide text after 3 seconds
                if (this.textTimer) {
                    clearTimeout(this.textTimer);
                }
                this.textTimer = setTimeout(() => {
                    textElement.style.display = 'none';
                }, 3000);
            }
            
            if (this.tapCount === 2) {
                // Double tap - deactivate black screen
                this.deactivateBlackScreen();
                this.tapCount = 0;
                return;
            }
            
            // Reset tap count after 500ms
            this.tapTimer = setTimeout(() => {
                this.tapCount = 0;
            }, 500);
        });
        
        // Prevent default touch behaviors
        overlay.addEventListener('touchstart', (e) => {
            if (this.blackScreenActive) {
                e.preventDefault();
            }
        }, { passive: false });
    }

    activateBlackScreen() {
        const overlay = document.getElementById('blackScreenOverlay');
        const textElement = document.getElementById('blackScreenText');
        
        if (!overlay) return;
        
        this.blackScreenActive = true;
        overlay.classList.add('active');
        textElement.style.display = 'none';
        this.tapCount = 0;
        
        console.log('Black screen activated');
    }

    deactivateBlackScreen() {
        const overlay = document.getElementById('blackScreenOverlay');
        const textElement = document.getElementById('blackScreenText');
        
        if (!overlay) return;
        
        this.blackScreenActive = false;
        overlay.classList.remove('active');
        textElement.style.display = 'none';
        
        // Clear any timers
        if (this.textTimer) {
            clearTimeout(this.textTimer);
            this.textTimer = null;
        }
        if (this.tapTimer) {
            clearTimeout(this.tapTimer);
            this.tapTimer = null;
        }
        
        console.log('Black screen deactivated');
        this.showToast('Stealth mode deactivated', 'info');
    }

    async initCamera() {
        const video = document.getElementById('cameraFeed');
        const status = document.getElementById('cameraStatus');
        
        if (!video || !status) {
            console.error('Video element not found');
            return;
        }
        
        status.textContent = 'Initializing...';
        
        try {
            // Check if getUserMedia is available
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                throw new Error('Camera API not supported in this browser');
            }
            
            // Try back-facing camera first
            let stream;
            try {
                console.log('Requesting back camera...');
                stream = await navigator.mediaDevices.getUserMedia({
                    video: {
                        facingMode: 'environment',
                        width: { ideal: 1280 },
                        height: { ideal: 720 }
                    },
                    audio: false
                });
            } catch (envError) {
                console.log('Back camera failed, trying any camera...');
                // Fallback to any camera
                stream = await navigator.mediaDevices.getUserMedia({
                    video: true,
                    audio: false
                });
            }
            
            this.currentStream = stream;
            video.srcObject = stream;
            
            // Wait for video to load
            await new Promise((resolve) => {
                video.onloadedmetadata = () => {
                    video.play();
                    resolve();
                };
            });
            
            status.textContent = 'Camera Ready';
            status.style.background = 'rgba(39, 174, 96, 0.9)';
            
            // Setup motion detection when video is ready
            this.setupMotionDetection();
            
            console.log('Camera initialized successfully');
            
        } catch (error) {
            console.error('Camera error:', error);
            status.textContent = 'Camera Error';
            status.style.background = 'rgba(231, 76, 60, 0.9)';
            
            let errorMessage = 'Unable to access camera. ';
            if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
                errorMessage += 'Please allow camera access in your browser settings.';
            } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
                errorMessage += 'No camera found on this device.';
            } else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
                errorMessage += 'Camera is already in use by another application.';
            } else if (location.protocol !== 'https:' && location.hostname !== 'localhost') {
                errorMessage += 'Camera requires HTTPS connection.';
            } else {
                errorMessage += error.message;
            }
            
            this.showToast(errorMessage, 'error');
        }
    }

    setupCanvases() {
        // Motion detection canvas
        this.motionCanvas = document.getElementById('motionCanvas');
        if (this.motionCanvas) {
            this.motionContext = this.motionCanvas.getContext('2d', { willReadFrequently: true });
        }
        
        // Capture canvas for taking pictures
        this.captureCanvas = document.getElementById('captureCanvas');
        if (this.captureCanvas) {
            this.captureContext = this.captureCanvas.getContext('2d');
        }
    }

    setupMotionDetection() {
        const video = document.getElementById('cameraFeed');
        
        if (!video) return;
        
        // Set canvas dimensions to match video
        if (this.motionCanvas && video.videoWidth) {
            this.motionCanvas.width = video.videoWidth;
            this.motionCanvas.height = video.videoHeight;
        }
        if (this.captureCanvas && video.videoWidth) {
            this.captureCanvas.width = video.videoWidth;
            this.captureCanvas.height = video.videoHeight;
        }
        
        // Motion detection loop
        if (!this.motionInterval) {
            this.motionInterval = setInterval(() => {
                if (this.motionDetectionActive && video.readyState === video.HAVE_ENOUGH_DATA) {
                    this.detectMotion();
                }
            }, 100); // Check every 100ms
        }
    }

    detectMotion() {
        const video = document.getElementById('cameraFeed');
        const canvas = this.motionCanvas;
        const context = this.motionContext;
        
        if (!context || !video || video.readyState !== video.HAVE_ENOUGH_DATA) return;
        
        try {
            // Draw current frame
            context.drawImage(video, 0, 0, canvas.width, canvas.height);
            const currentFrame = context.getImageData(0, 0, canvas.width, canvas.height);
            
            if (this.lastFrame) {
                let changedPixels = 0;
                const threshold = (100 - this.sensitivity) * 2.55; // Convert percentage to 0-255 range
                const pixelCount = currentFrame.data.length / 4;
                
                // Compare frames pixel by pixel
                for (let i = 0; i < currentFrame.data.length; i += 4) {
                    const rDiff = Math.abs(currentFrame.data[i] - this.lastFrame.data[i]);
                    const gDiff = Math.abs(currentFrame.data[i + 1] - this.lastFrame.data[i + 1]);
                    const bDiff = Math.abs(currentFrame.data[i + 2] - this.lastFrame.data[i + 2]);
                    
                    const totalDiff = (rDiff + gDiff + bDiff) / 3;
                    
                    if (totalDiff > threshold) {
                        changedPixels++;
                        // Highlight motion areas in red
                        currentFrame.data[i] = 255;     // Red
                        currentFrame.data[i + 1] = 0;   // Green
                        currentFrame.data[i + 2] = 0;   // Blue
                    }
                }
                
                // Put highlighted frame back on canvas
                context.putImageData(currentFrame, 0, 0);
                
                // Calculate motion percentage
                const motionPercentage = (changedPixels / pixelCount) * 100;
                
                // Check if motion exceeds threshold
                if (motionPercentage > this.motionThreshold) {
                    this.onMotionDetected(motionPercentage);
                }
            }
            
            // Store current frame for next comparison
            this.lastFrame = context.getImageData(0, 0, canvas.width, canvas.height);
        } catch (error) {
            console.error('Motion detection error:', error);
        }
    }

    onMotionDetected(motionLevel) {
        const now = Date.now();
        
        // Check cooldown period
        if (now - this.lastCaptureTime < this.cooldownPeriod) {
            return; // Still in cooldown
        }
        
        console.log('Motion detected! Level:', motionLevel);
        
        // Show motion indicator
        const indicator = document.getElementById('motionIndicator');
        if (indicator) {
            indicator.classList.add('active');
            setTimeout(() => indicator.classList.remove('active'), 2000);
        }
        
        // Update last motion time
        const lastMotionEl = document.getElementById('lastMotion');
        if (lastMotionEl) {
            lastMotionEl.textContent = new Date().toLocaleTimeString();
        }
        
        // Capture image
        this.captureMotionImage();
        
        // Create alert
        const alert = {
            id: Date.now(),
            timestamp: new Date().toISOString(),
            motionLevel: motionLevel.toFixed(1),
            read: false
        };
        
        this.alerts.unshift(alert);
        this.saveAlerts();
        this.updateAlertsList();
        this.updateNotificationBadge();
        
        // Update activity data
        const hour = new Date().getHours();
        this.activityData[hour]++;
        
        // Send notifications (even with black screen active)
        const enableAlerts = document.getElementById('enableAlerts');
        if (enableAlerts && enableAlerts.checked) {
            this.showNotification('Motion Detected!', `Motion level: ${motionLevel.toFixed(1)}%`);
            
            const soundAlerts = document.getElementById('soundAlerts');
            if (soundAlerts && soundAlerts.checked) {
                this.playAlertSound();
            }
            
            const vibrationAlerts = document.getElementById('vibrationAlerts');
            if (vibrationAlerts && vibrationAlerts.checked && navigator.vibrate) {
                navigator.vibrate([200, 100, 200]);
            }
        }
        
        this.lastCaptureTime = now;
    }

    captureMotionImage() {
        const video = document.getElementById('cameraFeed');
        const canvas = this.captureCanvas;
        const context = this.captureContext;
        
        if (!video || !canvas || !context) {
            console.error('Capture elements not ready');
            return;
        }
        
        try {
            // Set canvas size if not set
            if (canvas.width === 0) {
                canvas.width = video.videoWidth || 640;
                canvas.height = video.videoHeight || 480;
            }
            
            // Draw current video frame to capture canvas
            context.drawImage(video, 0, 0, canvas.width, canvas.height);
            
            // Add timestamp overlay
            context.fillStyle = 'rgba(0, 0, 0, 0.5)';
            context.fillRect(0, canvas.height - 30, canvas.width, 30);
            context.fillStyle = 'white';
            context.font = '16px monospace';
            context.fillText(new Date().toLocaleString(), 10, canvas.height - 10);
            
            // Convert to data URL with specified quality
            const imageData = canvas.toDataURL('image/jpeg', this.imageQuality);
            
            // Create capture object
            const capture = {
                id: Date.now(),
                timestamp: new Date().toISOString(),
                imageData: imageData,
                size: this.getImageSize(imageData)
            };
            
            // Add to captures array
            this.captures.unshift(capture);
            
            // Manage storage limits
            this.manageStorage();
            
            // Save to localStorage
            this.saveCaptures();
            
            // Update UI
            this.sessionCaptures++;
            const sessionCapturesEl = document.getElementById('sessionCaptures');
            if (sessionCapturesEl) {
                sessionCapturesEl.textContent = this.sessionCaptures;
            }
            
            this.updateCapturesGrid();
            this.updateDashboard();
            
            // Show success message (only if black screen is not active)
            if (!this.blackScreenActive) {
                this.showToast('Motion captured!', 'success');
            }
            
            console.log('Image captured successfully');
        } catch (error) {
            console.error('Capture error:', error);
            if (!this.blackScreenActive) {
                this.showToast('Failed to capture image', 'error');
            }
        }
    }

    getImageSize(dataUrl) {
        const base64 = dataUrl.split(',')[1];
        const bytes = atob(base64).length;
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }

    manageStorage() {
        // Check max images limit
        if (this.captures.length > this.maxStorageImages) {
            // Remove oldest captures
            const removed = this.captures.splice(this.maxStorageImages);
            console.log(`Removed ${removed.length} old captures`);
        }
        
        // Check retention period if auto-delete is enabled
        const autoDelete = document.getElementById('autoDelete');
        if (autoDelete && autoDelete.checked) {
            const retentionDays = parseInt(document.getElementById('retentionDays')?.value || 7);
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
            
            this.captures = this.captures.filter(capture => {
                return new Date(capture.timestamp) > cutoffDate;
            });
        }
    }

    setupEventListeners() {
        console.log('Setting up event listeners...');
        
        // Navigation
        document.querySelectorAll('.nav-item').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                this.switchTab(e.target.closest('.nav-item'));
            });
        });
        
        // Motion detection toggle
        const toggleBtn = document.getElementById('toggleDetection');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => this.toggleMotionDetection());
        }
        
        // Manual capture
        const manualCaptureBtn = document.getElementById('manualCapture');
        if (manualCaptureBtn) {
            manualCaptureBtn.addEventListener('click', () => this.manualCapture());
        }
        
        // Clear motion area
        const clearBtn = document.getElementById('clearMotionArea');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => this.clearMotionArea());
        }
        
        // Sensitivity slider
        const sensitivitySlider = document.getElementById('sensitivitySlider');
        if (sensitivitySlider) {
            sensitivitySlider.addEventListener('input', (e) => {
                this.sensitivity = e.target.value;
                document.getElementById('sensitivityValue').textContent = `${e.target.value}%`;
            });
        }
        
        // Capture delay slider
        const delaySlider = document.getElementById('captureDelay');
        if (delaySlider) {
            delaySlider.addEventListener('input', (e) => {
                this.captureDelay = e.target.value;
                this.cooldownPeriod = e.target.value * 1000;
                document.getElementById('delayValue').textContent = `${e.target.value}s`;
            });
        }
        
        // Settings
        const settingsBtn = document.getElementById('settingsBtn');
        if (settingsBtn) {
            settingsBtn.addEventListener('click', () => this.openSettings());
        }
        
        const saveSettingsBtn = document.getElementById('saveSettings');
        if (saveSettingsBtn) {
            saveSettingsBtn.addEventListener('click', () => this.saveSettings());
        }
        
        const resetSettingsBtn = document.getElementById('resetSettings');
        if (resetSettingsBtn) {
            resetSettingsBtn.addEventListener('click', () => this.resetSettings());
        }
        
        // Captures management
        const clearCapturesBtn = document.getElementById('clearCaptures');
        if (clearCapturesBtn) {
            clearCapturesBtn.addEventListener('click', () => this.clearAllCaptures());
        }
        
        const exportBtn = document.getElementById('exportCaptures');
        if (exportBtn) {
            exportBtn.addEventListener('click', () => this.exportCaptures());
        }
        
        const dateFilter = document.getElementById('dateFilter');
        if (dateFilter) {
            dateFilter.addEventListener('change', (e) => this.filterCaptures(e.target.value));
        }
        
        // Alert filters
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.filterAlerts(e.target.dataset.filter);
            });
        });
        
        // Modal close buttons
        document.querySelectorAll('.close-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.target.closest('.modal').classList.remove('active');
            });
        });
        
        // Modal click outside to close
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.classList.remove('active');
                }
            });
        });
    }

    toggleMotionDetection() {
        this.motionDetectionActive = !this.motionDetectionActive;
        
        const btn = document.getElementById('toggleDetection');
        const status = document.getElementById('detectionStatus');
        const motionCanvas = document.getElementById('motionCanvas');
        
        if (!btn || !status) return;
        
        if (this.motionDetectionActive) {
            btn.classList.add('active');
            btn.querySelector('.toggle-text').textContent = 'Stop Monitoring';
            btn.style.background = 'var(--success-color)';
            
            status.classList.add('active');
            const detectionText = document.getElementById('detectionText');
            if (detectionText) {
                detectionText.textContent = 'Motion Detection: ON';
            }
            
            if (motionCanvas) {
                motionCanvas.classList.add('active');
            }
            
            // Check if black screen should be activated
            const blackScreenCheckbox = document.getElementById('blackScreenMode');
            if (blackScreenCheckbox && blackScreenCheckbox.checked) {
                this.activateBlackScreen();
                this.showToast('Stealth mode activated - Double tap to reveal', 'info');
            } else {
                this.showToast('Motion detection activated', 'success');
            }
            
            console.log('Motion detection started');
        } else {
            btn.classList.remove('active');
            btn.querySelector('.toggle-text').textContent = 'Start Monitoring';
            btn.style.background = '';
            
            status.classList.remove('active');
            const detectionText = document.getElementById('detectionText');
            if (detectionText) {
                detectionText.textContent = 'Motion Detection: OFF';
            }
            
            if (motionCanvas) {
                motionCanvas.classList.remove('active');
            }
            
            // Deactivate black screen if active
            if (this.blackScreenActive) {
                this.deactivateBlackScreen();
            }
            
            this.lastFrame = null; // Reset frame comparison
            
            this.showToast('Motion detection deactivated', 'warning');
            console.log('Motion detection stopped');
        }
    }

    manualCapture() {
        const video = document.getElementById('cameraFeed');
        if (!video || video.readyState !== video.HAVE_ENOUGH_DATA) {
            this.showToast('Camera not ready', 'error');
            return;
        }
        
        console.log('Manual capture triggered');
        this.captureMotionImage();
    }

    clearMotionArea() {
        this.lastFrame = null;
        if (this.motionContext && this.motionCanvas) {
            this.motionContext.clearRect(0, 0, this.motionCanvas.width, this.motionCanvas.height);
        }
        this.showToast('Detection area reset', 'success');
    }

    switchTab(navItem) {
        if (!navItem) return;
        
        // Update navigation
        document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
        navItem.classList.add('active');
        
        // Update content
        const tabName = navItem.dataset.tab;
        if (!tabName) return;
        
        document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
        const targetTab = document.getElementById(`${tabName}Tab`);
        if (targetTab) {
            targetTab.classList.add('active');
        }
        
        // Update specific tab content
        if (tabName === 'captures') {
            this.updateCapturesGrid();
        } else if (tabName === 'alerts') {
            this.updateAlertsList();
        } else if (tabName === 'dashboard') {
            this.updateDashboard();
        }
    }

    updateCapturesGrid() {
        const grid = document.getElementById('capturesGrid');
        if (!grid) return;
        
        if (this.captures.length === 0) {
            grid.innerHTML = `
                <div class="empty-state" style="grid-column: 1/-1;">
                    <div class="empty-state-icon">📸</div>
                    <div class="empty-state-text">No captures yet</div>
                    <p style="color: var(--text-secondary); margin-top: 1rem;">
                        Start monitoring to capture motion events
                    </p>
                </div>
            `;
            return;
        }
        
        grid.innerHTML = this.captures.map(capture => `
            <div class="capture-item" data-id="${capture.id}">
                <img src="${capture.imageData}" alt="Motion capture" class="capture-image" loading="lazy">
                <div class="capture-info">
                    <span class="capture-date">${new Date(capture.timestamp).toLocaleDateString()}</span>
                    <span class="capture-time">${new Date(capture.timestamp).toLocaleTimeString()}</span>
                </div>
                <div class="capture-actions">
                    <button class="capture-action-btn" onclick="window.app.viewCapture(${capture.id})">👁️</button>
                    <button class="capture-action-btn" onclick="window.app.downloadCapture(${capture.id})">⬇️</button>
                    <button class="capture-action-btn" onclick="window.app.deleteCapture(${capture.id})">🗑️</button>
                </div>
            </div>
        `).join('');
    }

    viewCapture(id) {
        const capture = this.captures.find(c => c.id === id);
        if (!capture) return;
        
        const modal = document.getElementById('imageModal');
        const img = document.getElementById('modalImage');
        
        if (!modal || !img) return;
        
        img.src = capture.imageData;
        
        const dateEl = document.getElementById('imageDate');
        if (dateEl) dateEl.textContent = new Date(capture.timestamp).toLocaleDateString();
        
        const timeEl = document.getElementById('imageTime');
        if (timeEl) timeEl.textContent = new Date(capture.timestamp).toLocaleTimeString();
        
        const sizeEl = document.getElementById('imageSize');
        if (sizeEl) sizeEl.textContent = capture.size;
        
        // Set download action
        const downloadBtn = document.getElementById('downloadImage');
        if (downloadBtn) {
            downloadBtn.onclick = () => this.downloadCapture(id);
        }
        
        const deleteBtn = document.getElementById('deleteImage');
        if (deleteBtn) {
            deleteBtn.onclick = () => {
                this.deleteCapture(id);
                modal.classList.remove('active');
            };
        }
        
        const shareBtn = document.getElementById('shareImage');
        if (shareBtn) {
            shareBtn.onclick = () => this.shareCapture(id);
        }
        
        modal.classList.add('active');
    }

    downloadCapture(id) {
        const capture = this.captures.find(c => c.id === id);
        if (!capture) return;
        
        const link = document.createElement('a');
        link.download = `motion_${new Date(capture.timestamp).getTime()}.jpg`;
        link.href = capture.imageData;
        link.click();
        
        this.showToast('Image downloaded', 'success');
    }

    async shareCapture(id) {
        const capture = this.captures.find(c => c.id === id);
        if (!capture) return;
        
        if (navigator.share && navigator.canShare) {
            try {
                // Convert data URL to blob
                const response = await fetch(capture.imageData);
                const blob = await response.blob();
                const file = new File([blob], `motion_${capture.id}.jpg`, { type: 'image/jpeg' });
                
                if (navigator.canShare({ files: [file] })) {
                    await navigator.share({
                        title: 'Motion Capture',
                        text: `Motion detected at ${new Date(capture.timestamp).toLocaleString()}`,
                        files: [file]
                    });
                    
                    this.showToast('Image shared successfully', 'success');
                } else {
                    throw new Error('Cannot share files on this device');
                }
            } catch (error) {
                console.error('Error sharing:', error);
                if (error.name !== 'AbortError') {
                    this.showToast('Sharing failed: ' + error.message, 'error');
                }
            }
        } else {
            // Fallback - copy link or download
            this.downloadCapture(id);
            this.showToast('Sharing not supported - downloading instead', 'warning');
        }
    }

    deleteCapture(id) {
        if (!confirm('Delete this capture?')) return;
        
        const index = this.captures.findIndex(c => c.id === id);
        if (index !== -1) {
            this.captures.splice(index, 1);
            this.saveCaptures();
            this.updateCapturesGrid();
            this.updateDashboard();
            this.showToast('Capture deleted', 'success');
        }
    }

    clearAllCaptures() {
        if (!confirm('Delete all captures? This cannot be undone.')) return;
        
        this.captures = [];
        this.saveCaptures();
        this.updateCapturesGrid();
        this.updateDashboard();
        this.showToast('All captures cleared', 'success');
    }

    exportCaptures() {
        if (this.captures.length === 0) {
            this.showToast('No captures to export', 'warning');
            return;
        }
        
        // Create a zip file or download all images
        this.captures.forEach((capture, index) => {
            setTimeout(() => {
                const link = document.createElement('a');
                link.download = `motion_${new Date(capture.timestamp).getTime()}.jpg`;
                link.href = capture.imageData;
                link.click();
            }, index * 500); // Stagger downloads
        });
        
        this.showToast(`Exporting ${this.captures.length} captures...`, 'success');
    }

    filterCaptures(filter) {
        console.log('Filtering captures by:', filter);
        // Implementation for filtering captures by date
        // This would filter the display, not the actual data
    }

    filterAlerts(filter) {
        console.log('Filtering alerts by:', filter);
        // Implementation for filtering alerts
    }

    updateAlertsList() {
        const list = document.getElementById('alertsList');
        if (!list) return;
        
        if (this.alerts.length === 0) {
            list.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">🚨</div>
                    <div class="empty-state-text">No alerts yet</div>
                </div>
            `;
            return;
        }
        
        list.innerHTML = this.alerts.slice(0, 50).map(alert => {
            const capture = this.captures.find(c => 
                Math.abs(new Date(c.timestamp).getTime() - new Date(alert.timestamp).getTime()) < 1000
            );
            
            return `
                <div class="alert-item ${alert.read ? '' : 'unread'}" data-id="${alert.id}">
                    ${capture ? `<img src="${capture.imageData}" alt="Alert" class="alert-thumbnail">` : ''}
                    <div class="alert-info">
                        <div class="alert-title">Motion Detected</div>
                        <div class="alert-meta">
                            ${new Date(alert.timestamp).toLocaleString()} • 
                            Level: ${alert.motionLevel}%
                        </div>
                    </div>
                    <div class="alert-actions">
                        <button class="action-btn" onclick="window.app.markAlertRead(${alert.id})">✓</button>
                        <button class="action-btn" onclick="window.app.deleteAlert(${alert.id})">🗑️</button>
                    </div>
                </div>
            `;
        }).join('');
    }

    markAlertRead(id) {
        const alert = this.alerts.find(a => a.id === id);
        if (alert) {
            alert.read = true;
            this.saveAlerts();
            this.updateAlertsList();
            this.updateNotificationBadge();
        }
    }

    deleteAlert(id) {
        const index = this.alerts.findIndex(a => a.id === id);
        if (index !== -1) {
            this.alerts.splice(index, 1);
            this.saveAlerts();
            this.updateAlertsList();
            this.updateNotificationBadge();
        }
    }

    updateNotificationBadge() {
        const badge = document.getElementById('notificationBadge');
        if (!badge) return;
        
        const unreadCount = this.alerts.filter(a => !a.read).length;
        badge.textContent = unreadCount;
        badge.style.display = unreadCount > 0 ? 'block' : 'none';
    }

    updateDashboard() {
        // Update stats
        const totalCapturesEl = document.getElementById('totalCaptures');
        if (totalCapturesEl) totalCapturesEl.textContent = this.captures.length;
        
        const totalAlertsEl = document.getElementById('totalAlerts');
        if (totalAlertsEl) totalAlertsEl.textContent = this.alerts.length;
        
        // Calculate storage
        const totalSize = this.calculateTotalStorage();
        const storageEl = document.getElementById('storageUsed');
        if (storageEl) storageEl.textContent = totalSize;
        
        const storageIndicator = document.getElementById('storageIndicator');
        if (storageIndicator) storageIndicator.textContent = totalSize;
        
        // Update uptime
        const uptime = Date.now() - this.startTime;
        const hours = Math.floor(uptime / 3600000);
        const minutes = Math.floor((uptime % 3600000) / 60000);
        const uptimeEl = document.getElementById('uptime');
        if (uptimeEl) uptimeEl.textContent = `${hours}h ${minutes}m`;
        
        // Update activity chart
        this.updateActivityChart();
        
        // Update recent activity
        this.updateRecentActivity();
    }

    calculateTotalStorage() {
        let totalBytes = 0;
        this.captures.forEach(capture => {
            if (capture.imageData) {
                const base64 = capture.imageData.split(',')[1];
                totalBytes += atob(base64).length;
            }
        });
        
        if (totalBytes < 1024) return totalBytes + ' B';
        if (totalBytes < 1024 * 1024) return (totalBytes / 1024).toFixed(1) + ' KB';
        return (totalBytes / (1024 * 1024)).toFixed(1) + ' MB';
    }

    updateActivityChart() {
        const canvas = document.getElementById('activityChart');
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        const width = canvas.width = canvas.offsetWidth;
        const height = canvas.height = 300;
        
        ctx.clearRect(0, 0, width, height);
        
        // Draw activity bars
        const barWidth = width / 24;
        const maxValue = Math.max(...this.activityData, 1);
        
        ctx.fillStyle = '#4a90e2';
        
        this.activityData.forEach((value, hour) => {
            const barHeight = (value / maxValue) * (height - 40);
            const x = hour * barWidth;
            const y = height - barHeight - 20;
            
            ctx.fillRect(x + 2, y, barWidth - 4, barHeight);
        });
        
        // Draw axis labels
        ctx.fillStyle = '#b0b0b0';
        ctx.font = '10px Arial';
        
        for (let i = 0; i < 24; i += 4) {
            ctx.fillText(`${i}:00`, i * barWidth, height - 5);
        }
    }

    updateRecentActivity() {
        const list = document.getElementById('recentActivityList');
        if (!list) return;
        
        const recentEvents = [...this.alerts]
            .slice(0, 5)
            .map(alert => ({
                text: `Motion detected (${alert.motionLevel}%)`,
                time: new Date(alert.timestamp).toLocaleTimeString()
            }));
        
        if (recentEvents.length === 0) {
            list.innerHTML = '<div class="activity-item">No recent activity</div>';
            return;
        }
        
        list.innerHTML = recentEvents.map(event => `
            <div class="activity-item">
                <span class="activity-text">${event.text}</span>
                <span class="activity-time">${event.time}</span>
            </div>
        `).join('');
    }

    startActivityTracking() {
        // Reset activity data at midnight
        const now = new Date();
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(0, 0, 0, 0);
        
        const msUntilMidnight = tomorrow - now;
        
        setTimeout(() => {
            this.activityData = new Array(24).fill(0);
            this.startActivityTracking(); // Reschedule for next midnight
        }, msUntilMidnight);
    }

    startTimeUpdate() {
        setInterval(() => {
            const timestamp = document.getElementById('timestamp');
            if (timestamp) {
                timestamp.textContent = new Date().toLocaleTimeString();
            }
        }, 1000);
    }

    openSettings() {
        const modal = document.getElementById('settingsModal');
        if (modal) {
            modal.classList.add('active');
            this.loadSettings();
        }
    }

    loadSettings() {
        const savedSettings = localStorage.getItem('cameraSettings');
        if (savedSettings) {
            try {
                const settings = JSON.parse(savedSettings);
                
                if (settings.imageQuality) {
                    const qualityEl = document.getElementById('imageQuality');
                    if (qualityEl) qualityEl.value = settings.imageQuality;
                    this.imageQuality = parseFloat(settings.imageQuality);
                }
                
                if (settings.motionThreshold) {
                    const thresholdEl = document.getElementById('motionThreshold');
                    if (thresholdEl) thresholdEl.value = settings.motionThreshold;
                    this.motionThreshold = parseFloat(settings.motionThreshold);
                }
                
                if (settings.cooldownPeriod) {
                    const cooldownEl = document.getElementById('cooldownPeriod');
                    if (cooldownEl) cooldownEl.value = settings.cooldownPeriod;
                    this.cooldownPeriod = parseInt(settings.cooldownPeriod) * 1000;
                }
                
                if (settings.maxImages) {
                    const maxImagesEl = document.getElementById('maxImages');
                    if (maxImagesEl) maxImagesEl.value = settings.maxImages;
                    this.maxStorageImages = parseInt(settings.maxImages);
                }
                
                // Load black screen setting
                if (settings.blackScreenMode !== undefined) {
                    const blackScreenEl = document.getElementById('blackScreenMode');
                    if (blackScreenEl) blackScreenEl.checked = settings.blackScreenMode;
                    this.blackScreenEnabled = settings.blackScreenMode;
                }
            } catch (error) {
                console.error('Error loading settings:', error);
            }
        }
    }

    saveSettings() {
        const settings = {
            imageQuality: document.getElementById('imageQuality')?.value || '0.7',
            captureResolution: document.getElementById('captureResolution')?.value || '1280x720',
            motionThreshold: document.getElementById('motionThreshold')?.value || '2',
            cooldownPeriod: document.getElementById('cooldownPeriod')?.value || '5',
            nightMode: document.getElementById('nightMode')?.checked || false,
            maxImages: document.getElementById('maxImages')?.value || '100',
            autoDelete: document.getElementById('autoDelete')?.checked || false,
            retentionDays: document.getElementById('retentionDays')?.value || '7',
            blackScreenMode: document.getElementById('blackScreenMode')?.checked || false
        };
        
        // Apply settings
        this.imageQuality = parseFloat(settings.imageQuality);
        this.motionThreshold = parseFloat(settings.motionThreshold);
        this.cooldownPeriod = parseInt(settings.cooldownPeriod) * 1000;
        this.maxStorageImages = parseInt(settings.maxImages);
        this.blackScreenEnabled = settings.blackScreenMode;
        
        localStorage.setItem('cameraSettings', JSON.stringify(settings));
        
        const modal = document.getElementById('settingsModal');
        if (modal) modal.classList.remove('active');
        
        this.showToast('Settings saved', 'success');
    }

    resetSettings() {
        if (!confirm('Reset all settings to default?')) return;
        
        localStorage.removeItem('cameraSettings');
        
        // Reset to defaults
        this.imageQuality = 0.7;
        this.motionThreshold = 2;
        this.cooldownPeriod = 5000;
        this.maxStorageImages = 100;
        this.sensitivity = 30;
        this.blackScreenEnabled = false;
        
        // Reset UI
        const qualityEl = document.getElementById('imageQuality');
        if (qualityEl) qualityEl.value = '0.7';
        
        const thresholdEl = document.getElementById('motionThreshold');
        if (thresholdEl) thresholdEl.value = '2';
        
        const cooldownEl = document.getElementById('cooldownPeriod');
        if (cooldownEl) cooldownEl.value = '5';
        
        const maxImagesEl = document.getElementById('maxImages');
        if (maxImagesEl) maxImagesEl.value = '100';
        
        const blackScreenEl = document.getElementById('blackScreenMode');
        if (blackScreenEl) blackScreenEl.checked = false;
        
        this.showToast('Settings reset to defaults', 'success');
    }

    saveCaptures() {
        try {
            // Only save metadata and limited captures due to localStorage limits
            const toSave = this.captures.slice(0, 10).map(capture => ({
                ...capture,
                // Compress image data for storage
                imageData: this.compressImageData(capture.imageData)
            }));
            
            localStorage.setItem('captures', JSON.stringify(toSave));
        } catch (error) {
            console.error('Error saving captures:', error);
            if (error.name === 'QuotaExceededError') {
                this.showToast('Storage full - clearing old captures', 'warning');
                this.captures = this.captures.slice(0, 5);
                this.saveCaptures();
            }
        }
    }

    compressImageData(dataUrl) {
        // Simple compression by reducing quality
        // In a real app, you'd want better compression or server storage
        return dataUrl;
    }

    saveAlerts() {
        try {
            localStorage.setItem('alerts', JSON.stringify(this.alerts.slice(0, 100)));
        } catch (error) {
            console.error('Error saving alerts:', error);
        }
    }

    loadSavedData() {
        // Load settings
        this.loadSettings();
        
        // Load captures
        try {
            const savedCaptures = localStorage.getItem('captures');
            if (savedCaptures) {
                this.captures = JSON.parse(savedCaptures);
                console.log(`Loaded ${this.captures.length} captures`);
            }
        } catch (error) {
            console.error('Error loading captures:', error);
            this.captures = [];
        }
        
        // Load alerts
        try {
            const savedAlerts = localStorage.getItem('alerts');
            if (savedAlerts) {
                this.alerts = JSON.parse(savedAlerts);
                console.log(`Loaded ${this.alerts.length} alerts`);
            }
        } catch (error) {
            console.error('Error loading alerts:', error);
            this.alerts = [];
        }
    }

    updateUI() {
        this.updateCapturesGrid();
        this.updateAlertsList();
        this.updateDashboard();
        this.updateNotificationBadge();
    }

    async requestNotificationPermission() {
        if ('Notification' in window && Notification.permission === 'default') {
            try {
                const permission = await Notification.requestPermission();
                console.log('Notification permission:', permission);
            } catch (error) {
                console.error('Error requesting notification permission:', error);
            }
        }
    }

    showNotification(title, body) {
        if ('Notification' in window && Notification.permission === 'granted') {
            try {
                new Notification(title, {
                    body: body,
                    icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/
