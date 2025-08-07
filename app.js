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
        
        this.init();
    }

    async init() {
        // Initialize camera with back-facing preference
        await this.initCamera();
        
        // Setup canvases
        this.setupCanvases();
        
        // Setup event listeners
        this.setupEventListeners();
        
        // Load saved data
        this.loadSavedData();
        
        // Update UI
        this.updateUI();
        
        // Start time update
        this.startTimeUpdate();
        
        // Request notification permission
        this.requestNotificationPermission();
        
        // Setup activity tracking
        this.startActivityTracking();
    }

    async initCamera() {
        const video = document.getElementById('cameraFeed');
        const status = document.getElementById('cameraStatus');
        
        try {
            // Request back-facing camera specifically
            const constraints = {
                video: {
                    facingMode: { exact: 'environment' }, // Back-facing camera
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                },
                audio: false // No audio needed for motion detection
            };
            
            try {
                // Try exact constraint first
                this.currentStream = await navigator.mediaDevices.getUserMedia(constraints);
            } catch (exactError) {
                // Fallback to any available camera if back camera not available
                console.log('Back camera not available, using default camera');
                const fallbackConstraints = {
                    video: {
                        width: { ideal: 1280 },
                        height: { ideal: 720 }
                    },
                    audio: false
                };
                this.currentStream = await navigator.mediaDevices.getUserMedia(fallbackConstraints);
            }
            
            video.srcObject = this.currentStream;
            
            status.textContent = 'Camera Ready';
            status.style.background = 'rgba(39, 174, 96, 0.9)';
            
            // Setup motion detection when video is ready
            video.addEventListener('loadedmetadata', () => {
                this.setupMotionDetection();
            });
            
        } catch (error) {
            console.error('Error accessing camera:', error);
            status.textContent = 'Camera Error';
            status.style.background = 'rgba(231, 76, 60, 0.9)';
            this.showToast('Camera Error: ' + error.message, 'error');
        }
    }

    setupCanvases() {
        // Motion detection canvas
        this.motionCanvas = document.getElementById('motionCanvas');
        this.motionContext = this.motionCanvas.getContext('2d', { willReadFrequently: true });
        
        // Capture canvas for taking pictures
        this.captureCanvas = document.getElementById('captureCanvas');
        this.captureContext = this.captureCanvas.getContext('2d');
        
        const video = document.getElementById('cameraFeed');
        video.addEventListener('loadedmetadata', () => {
            // Set canvas dimensions to match video
            this.motionCanvas.width = video.videoWidth;
            this.motionCanvas.height = video.videoHeight;
            this.captureCanvas.width = video.videoWidth;
            this.captureCanvas.height = video.videoHeight;
        });
    }

    setupMotionDetection() {
        const video = document.getElementById('cameraFeed');
        
        // Motion detection loop
        setInterval(() => {
            if (this.motionDetectionActive && video.readyState === video.HAVE_ENOUGH_DATA) {
                this.detectMotion();
            }
        }, 100); // Check every 100ms
    }

    detectMotion() {
        const video = document.getElementById('cameraFeed');
        const canvas = this.motionCanvas;
        const context = this.motionContext;
        
        if (!context || !video) return;
        
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
    }

    onMotionDetected(motionLevel) {
        const now = Date.now();
        
        // Check cooldown period
        if (now - this.lastCaptureTime < this.cooldownPeriod) {
            return; // Still in cooldown
        }
        
        // Show motion indicator
        const indicator = document.getElementById('motionIndicator');
        indicator.classList.add('active');
        setTimeout(() => indicator.classList.remove('active'), 2000);
        
        // Update last motion time
        document.getElementById('lastMotion').textContent = new Date().toLocaleTimeString();
        
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
        
        // Send notifications
        if (document.getElementById('enableAlerts').checked) {
            this.showNotification('Motion Detected!', `Motion level: ${motionLevel.toFixed(1)}%`);
            
            if (document.getElementById('soundAlerts').checked) {
                this.playAlertSound();
            }
            
            if (document.getElementById('vibrationAlerts')?.checked && navigator.vibrate) {
                navigator.vibrate([200, 100, 200]);
            }
        }
        
        this.lastCaptureTime = now;
    }

    captureMotionImage() {
        const video = document.getElementById('cameraFeed');
        const canvas = this.captureCanvas;
        const context = this.captureContext;
        
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
        document.getElementById('sessionCaptures').textContent = this.sessionCaptures;
        this.updateCapturesGrid();
        this.updateDashboard();
        
        // Show success message
        this.showToast('Motion captured!', 'success');
    }

    manageStorage() {
        // Check max images limit
        if (this.captures.length > this.maxStorageImages) {
            // Remove oldest captures
            const removed = this.captures.splice(this.maxStorageImages);
            console.log(`Removed ${removed.length} old captures`);
        }
        
        // Check retention period if auto-delete is enabled
        if (document.getElementById('autoDelete')?.checked) {
            const retentionDays = parseInt(document.getElementById('retentionDays')?.value || 7);
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
            
            this.captures = this.captures.filter(capture => {
                return new Date(capture.timestamp) > cutoffDate;
            });
        }
    }

    setupEventListeners() {
        // Navigation
        document.querySelectorAll('.nav-item').forEach(btn => {
            btn.addEventListener('click', (e) => this.switchTab(e.target.closest('.nav-item')));
        });
        
        // Motion detection toggle
        document.getElementById('toggleDetection').addEventListener('click', () => this.toggleMotionDetection());
        
        // Manual capture
        document.getElementById('manualCapture').addEventListener('click', () => this.manualCapture());
        
        // Clear motion area
        document.getElementById('clearMotionArea').addEventListener('click', () => this.clearMotionArea());
        
        // Sensitivity slider
        document.getElementById('sensitivitySlider').addEventListener('input', (e) => {
            this.sensitivity = e.target.value;
            document.getElementById('sensitivityValue').textContent = `${e.target.value}%`;
        });
        
        // Capture delay slider
        document.getElementById('captureDelay').addEventListener('input', (e) => {
            this.captureDelay = e.target.value;
            this.cooldownPeriod = e.target.value * 1000;
            document.getElementById('delayValue').textContent = `${e.target.value}s`;
        });
        
        // Settings
        document.getElementById('settingsBtn').addEventListener('click', () => this.openSettings());
        document.getElementById('saveSettings').addEventListener('click', () => this.saveSettings());
        document.getElementById('resetSettings').addEventListener('click', () => this.resetSettings());
        
        // Captures management
        document.getElementById('clearCaptures').addEventListener('click', () => this.clearAllCaptures());
        document.getElementById('exportCaptures').addEventListener('click', () => this.exportCaptures());
        document.getElementById('dateFilter').addEventListener('change', (e) => this.filterCaptures(e.target.value));
        
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
        
        if (this.motionDetectionActive) {
            btn.classList.add('active');
            btn.querySelector('.toggle-text').textContent = 'Stop Monitoring';
            btn.style.background = 'var(--success-color)';
            
            status.classList.add('active');
            document.getElementById('detectionText').textContent = 'Motion Detection: ON';
            
            motionCanvas.classList.add('active');
            
            this.showToast('Motion detection activated', 'success');
        } else {
            btn.classList.remove('active');
            btn.querySelector('.toggle-text').textContent = 'Start Monitoring';
            btn.style.background = 'var(--primary-color)';
            
            status.classList.remove('active');
            document.getElementById('detectionText').textContent = 'Motion Detection: OFF';
            
            motionCanvas.classList.remove('active');
            
            this.lastFrame = null; // Reset frame comparison
            
            this.showToast('Motion detection deactivated', 'warning');
        }
    }

    manualCapture() {
        const video = document.getElementById('cameraFeed');
        if (video.readyState !== video.HAVE_ENOUGH_DATA) {
            this.showToast('Camera not ready', 'error');
            return;
        }
        
        this.captureMotionImage();
    }

    clearMotionArea() {
        this.lastFrame = null;
        const context = this.motionContext;
        if (context) {
            context.clearRect(0, 0, this.motionCanvas.width, this.motionCanvas.height);
        }
        this.showToast('Detection area reset', 'success');
    }

    switchTab(navItem) {
        // Update navigation
        document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
        navItem.classList.add('active');
        
        // Update content
        const tabName = navItem.dataset.tab;
        document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
        document.getElementById(`${tabName}Tab`).classList.add('active');
        
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
        
        if (this.captures.length === 0) {
            grid.innerHTML = `
                <div class="empty-state" style="grid-column: 1/-1;">
                    <div class="empty-state-icon">📸</div>
                    <div class="empty-state-text">No captures yet</div>
                </div>
            `;
            return;
        }
        
        grid.innerHTML = this.captures.map(capture => `
            <div class="capture-item" data-id="${capture.id}">
                <img src="${capture.imageData}" alt="Motion capture" class="capture-image">
                <div class="capture-info">
                    <span class="capture-date">${new Date(capture.timestamp).toLocaleDateString()}</span>
                    <span class="capture-time">${new Date(capture.timestamp).toLocaleTimeString()}</span>
                </div>
                <div class="capture-actions">
                    <button class="capture-action-btn" onclick="app.viewCapture(${capture.id})">👁️</button>
                    <button class="capture-action-btn" onclick="app.downloadCapture(${capture.id})">⬇️</button>
                    <button class="capture-action-btn" onclick="app.deleteCapture(${capture.id})">🗑️</button>
                </div>
            </div>
        `).join('');
    }

    viewCapture(id) {
        const capture = this.captures.find(c => c.id === id);
        if (!capture) return;
        
        const modal = document.getElementById('imageModal');
        const img = document.getElementById('modalImage');
        
        img.src = capture.imageData;
        document.getElementById('imageDate').textContent = new Date(capture.timestamp).toLocaleDateString();
        document.getElementById('imageTime').textContent = new Date(capture.timestamp).toLocaleTimeString();
        document.getElementById('imageSize').textContent = capture.size;
        
        // Set download action
        document.getElementById('downloadImage').onclick = () => this.downloadCapture(id);
        document.getElementById('deleteImage').onclick = () => {
            this.deleteCapture(id);
            modal.classList.remove('active');
        };
        document.getElementById('shareImage').onclick = () => this.shareCapture(id);
        
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
        
        if (navigator.share) {
            try {
                // Convert data URL to blob
                const response = await fetch(capture.imageData);
                const blob = await response.blob();
                const file = new File([blob], `motion_${capture.id}.jpg`, { type: 'image/jpeg' });
                
                await navigator.share({
                    title: 'Motion Capture',
                    text: `Motion detected at ${new Date(capture.timestamp).toLocaleString()}`,
                    files: [file]
                });
                
                this.showToast('Image shared successfully', 'success');
            } catch (error) {
                console.error('Error sharing:', error);
                this.showToast('Sharing failed', 'error');
            }
        } else {
            // Fallback - copy image to clipboard or show URL
            this.showToast('Sharing not supported on this device', 'warning');
        }
    }

    deleteCapture(id) {
        const index = this.captures.findIndex(c => c.id === id);
        if (index !== -1) {
            this.captures.splice(index, 1);
            this.saveCaptures();
            this.updateCapturesGrid();
            this.updateDashboard();
            this.showToast('Capture deleted', 'success');
