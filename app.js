// Mobile Security Camera Web App
class SecurityCameraApp {
    constructor() {
        this.camera = null;
        this.mediaRecorder = null;
        this.recordedChunks = [];
        this.recordings = [];
        this.alerts = [];
        this.motionDetectionEnabled = false;
        this.isRecording = false;
        this.currentStream = null;
        this.facingMode = 'user';
        this.motionCanvas = null;
        this.motionContext = null;
        this.lastFrame = null;
        this.sensitivity = 50;
        this.startTime = Date.now();
        
        this.init();
    }

    async init() {
        // Initialize camera
        await this.initCamera();
        
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
        
        // Initialize motion detection canvas
        this.initMotionDetection();
        
        // Setup activity chart
        this.setupActivityChart();
    }

    async initCamera() {
        const video = document.getElementById('cameraFeed');
        const status = document.getElementById('cameraStatus');
        
        try {
            const constraints = {
                video: {
                    facingMode: this.facingMode,
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                },
                audio: true
            };
            
            this.currentStream = await navigator.mediaDevices.getUserMedia(constraints);
            video.srcObject = this.currentStream;
            
            status.textContent = 'Camera Active';
            status.style.background = 'rgba(39, 174, 96, 0.9)';
            
            // Setup motion detection
            this.setupMotionDetection();
            
        } catch (error) {
            console.error('Error accessing camera:', error);
            status.textContent = 'Camera Error';
            status.style.background = 'rgba(231, 76, 60, 0.9)';
            this.showNotification('Camera Error', 'Unable to access camera. Please check permissions.');
        }
    }

    initMotionDetection() {
        this.motionCanvas = document.getElementById('motionCanvas');
        this.motionContext = this.motionCanvas.getContext('2d');
        
        const video = document.getElementById('cameraFeed');
        video.addEventListener('loadedmetadata', () => {
            this.motionCanvas.width = video.videoWidth;
            this.motionCanvas.height = video.videoHeight;
        });
    }

    setupMotionDetection() {
        const video = document.getElementById('cameraFeed');
        
        setInterval(() => {
            if (this.motionDetectionEnabled && video.readyState === video.HAVE_ENOUGH_DATA) {
                this.detectMotion();
            }
        }, 100);
    }

    detectMotion() {
        const video = document.getElementById('cameraFeed');
        const canvas = this.motionCanvas;
        const context = this.motionContext;
        
        if (!context) return;
        
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const currentFrame = context.getImageData(0, 0, canvas.width, canvas.height);
        
        if (this.lastFrame) {
            let motionPixels = 0;
            const threshold = (100 - this.sensitivity) * 2.55;
            
            for (let i = 0; i < currentFrame.data.length; i += 4) {
                const rDiff = Math.abs(currentFrame.data[i] - this.lastFrame.data[i]);
                const gDiff = Math.abs(currentFrame.data[i + 1] - this.lastFrame.data[i + 1]);
                const bDiff = Math.abs(currentFrame.data[i + 2] - this.lastFrame.data[i + 2]);
                
                const totalDiff = rDiff + gDiff + bDiff;
                
                if (totalDiff > threshold) {
                    motionPixels++;
                    // Highlight motion areas
                    currentFrame.data[i] = 255;
                    currentFrame.data[i + 1] = 0;
                    currentFrame.data[i + 2] = 0;
                }
            }
            
            context.putImageData(currentFrame, 0, 0);
            
            const motionPercentage = (motionPixels / (canvas.width * canvas.height)) * 100;
            
            if (motionPercentage > 0.5) {
                this.onMotionDetected();
            }
        }
        
        this.lastFrame = currentFrame;
    }

    onMotionDetected() {
        const indicator = document.getElementById('motionIndicator');
        indicator.classList.add('active');
        
        setTimeout(() => {
            indicator.classList.remove('active');
        }, 2000);
        
        // Create alert
        const alert = {
            id: Date.now(),
            timestamp: new Date().toISOString(),
            type: 'motion',
            thumbnail: this.captureFrame()
        };
        
        this.alerts.unshift(alert);
        this.saveAlerts();
        this.updateAlertsList();
        this.updateNotificationBadge();
        
        // Send notification
        if (document.getElementById('enableAlerts').checked) {
            this.showNotification('Motion Detected!', 'Movement detected in camera view');
            
            if (document.getElementById('soundAlerts').checked) {
                this.playAlertSound();
            }
        }
        
        // Auto-record if enabled
        if (!this.isRecording && document.getElementById('autoRecord')?.checked) {
            this.startRecording();
            setTimeout(() => this.stopRecording(), 30000); // Record for 30 seconds
        }
    }

    setupEventListeners() {
        // Navigation
        document.querySelectorAll('.nav-item').forEach(btn => {
            btn.addEventListener('click', (e) => this.switchTab(e.target.closest('.nav-item')));
        });
        
        // Camera controls
        document.getElementById('switchCamera').addEventListener('click', () => this.switchCamera());
        document.getElementById('recordBtn').addEventListener('click', () => this.toggleRecording());
        document.getElementById('snapshotBtn').addEventListener('click', () => this.takeSnapshot());
        
        // Motion detection
        document.getElementById('motionDetection').addEventListener('change', (e) => {
            this.motionDetectionEnabled = e.target.checked;
            this.motionCanvas.style.display = e.target.checked ? 'block' : 'none';
        });
        
        document.getElementById('sensitivitySlider').addEventListener('input', (e) => {
            this.sensitivity = e.target.value;
            document.getElementById('sensitivityValue').textContent = `${e.target.value}%`;
        });
        
        // Settings
        document.getElementById('settingsBtn').addEventListener('click', () => this.openSettings());
        document.getElementById('saveSettings').addEventListener('click', () => this.saveSettings());
        document.getElementById('resetSettings').addEventListener('click', () => this.resetSettings());
        
        // Clear recordings
        document.getElementById('clearRecordings').addEventListener('click', () => this.clearAllRecordings());
        
        // Date filter
        document.getElementById('dateFilter').addEventListener('change', (e) => this.filterRecordings(e.target.value));
        
        // Modal close buttons
        document.querySelectorAll('.close-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.target.closest('.modal').classList.remove('active');
            });
        });
        
        // Video quality change
        document.getElementById('videoQuality').addEventListener('change', (e) => this.changeVideoQuality(e.target.value));
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
        if (tabName === 'recordings') {
            this.updateRecordingsList();
        } else if (tabName === 'alerts') {
            this.updateAlertsList();
        } else if (tabName === 'dashboard') {
            this.updateDashboard();
        }
    }

    async switchCamera() {
        this.facingMode = this.facingMode === 'user' ? 'environment' : 'user';
        
        if (this.currentStream) {
            this.currentStream.getTracks().forEach(track => track.stop());
        }
        
        await this.initCamera();
    }

    toggleRecording() {
        if (this.isRecording) {
            this.stopRecording();
        } else {
            this.startRecording();
        }
    }

    startRecording() {
        const video = document.getElementById('cameraFeed');
        const recordBtn = document.getElementById('recordBtn');
        const indicator = document.getElementById('recordingIndicator');
        
        if (!this.currentStream) {
            this.showNotification('Error', 'Camera not available');
            return;
        }
        
        const options = {
            mimeType: 'video/webm;codecs=vp9',
            videoBitsPerSecond: 2500000
        };
        
        try {
            this.mediaRecorder = new MediaRecorder(this.currentStream, options);
            this.recordedChunks = [];
            
            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.recordedChunks.push(event.data);
                }
            };
            
            this.mediaRecorder.onstop = () => {
                this.saveRecording();
            };
            
            this.mediaRecorder.start(1000); // Collect data every second
            this.isRecording = true;
            
            // Update UI
            recordBtn.classList.add('recording');
            recordBtn.querySelector('.record-text').textContent = 'Stop';
            indicator.classList.add('active');
            
            this.showNotification('Recording Started', 'Video recording in progress');
            
        } catch (error) {
            console.error('Error starting recording:', error);
            this.showNotification('Recording Error', 'Unable to start recording');
        }
    }

    stopRecording() {
        if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
            this.mediaRecorder.stop();
            this.isRecording = false;
            
            // Update UI
            const recordBtn = document.getElementById('recordBtn');
            const indicator = document.getElementById('recordingIndicator');
            
            recordBtn.classList.remove('recording');
            recordBtn.querySelector('.record-text').textContent = 'Record';
            indicator.classList.remove('active');
            
            this.showNotification('Recording Stopped', 'Video saved successfully');
        }
    }

    saveRecording() {
        const blob = new Blob(this.recordedChunks, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const timestamp = new Date().toISOString();
        
        const recording = {
            id: Date.now(),
            url: url,
            blob: blob,
            timestamp: timestamp,
            duration: this.recordedChunks.length,
            size: blob.size,
            thumbnail: this.captureFrame()
        };
        
        this.recordings.unshift(recording);
        this.saveRecordingsMetadata();
        this.updateRecordingsList();
        this.updateDashboard();
    }

    captureFrame() {
        const video = document.getElementById('cameraFeed');
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 480;
        const context = canvas.getContext('2d');
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL('image/jpeg', 0.7);
    }

    takeSnapshot() {
        const dataUrl = this.captureFrame();
        const link = document.createElement('a');
        link.download = `snapshot_${new Date().getTime()}.jpg`;
        link.href = dataUrl;
        link.click();
        
        this.showNotification('Snapshot Taken', 'Image saved to downloads');
    }

    updateRecordingsList() {
        const list = document.getElementById('recordingsList');
        
        if (this.recordings.length === 0) {
            list.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">📹</div>
                    <div class="empty-state-text">No recordings yet</div>
                </div>
            `;
            return;
        }
        
        list.innerHTML = this.recordings.map(recording => `
            <div class="recording-item" data-id="${recording.id}">
                <img src="${recording.thumbnail}" alt="Recording thumbnail" class="recording-thumbnail">
                <div class="recording-info">
                    <div class="recording-title">Recording ${recording.id}</div>
                    <div class="recording-meta">
                        ${new Date(recording.timestamp).toLocaleString()} • 
                        ${this.formatDuration(recording.duration)} • 
                        ${this.formatFileSize(recording.size)}
                    </div>
                </div>
                <div class="recording-actions">
                    <button class="action-btn" onclick="app.playRecording(${recording.id})">▶️</button>
                    <button class="action-btn" onclick="app.downloadRecording(${recording.id})">⬇️</button>
                    <button class="action-btn" onclick="app.deleteRecording(${recording.id})">🗑️</button>
                </div>
            </div>
        `).join('');
    }

    updateAlertsList() {
        const list = document.getElementById('alertsList');
        
        if (this.alerts.length === 0) {
            list.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">🚨</div>
                    <div class="empty-state-text">No alerts yet</div>
                </div>
            `;
            return;
        }
        
        list.innerHTML = this.alerts.map(alert => `
            <div class="alert-item" data-id="${alert.id}">
                <img src="${alert.thumbnail}" alt="Alert thumbnail" class="recording-thumbnail">
                <div class="alert-info">
                    <div class="alert-title">
                        Motion Detected
                        <span class="alert-badge">Motion</span>
                    </div>
                    <div class="alert-meta">
                        ${new Date(alert.timestamp).toLocaleString()}
                    </div>
                </div>
                <div class="alert-actions">
                    <button class="action-btn" onclick="app.viewAlert(${alert.id})">👁️</button>
                    <button class="action-btn" onclick="app.deleteAlert(${alert.id})">🗑️</button>
                </div>
            </div>
        `).join('');
    }

    updateDashboard() {
        // Update stats
        document.getElementById('totalRecordings').textContent = this.recordings.length;
        document.getElementById('totalAlerts').textContent = this.alerts.length;
        
        // Calculate storage
        const totalSize = this.recordings.reduce((sum, rec) => sum + (rec.size || 0), 0);
        document.getElementById('storageUsed').textContent = this.formatFileSize(totalSize);
        
        // Update uptime
        const uptime = Date.now() - this.startTime;
        const hours = Math.floor(uptime / 3600000);
        const minutes = Math.floor((uptime % 3600000) / 60000);
        document.getElementById('uptime').textContent = `${hours}h ${minutes}m`;
        
        // Update activity chart
        this.updateActivityChart();
    }

    setupActivityChart() {
        const canvas = document.getElementById('activityChart');
        const ctx = canvas.getContext('2d');
        
        // Simple bar chart for motion activity
        this.drawActivityChart(ctx, canvas);
    }

    drawActivityChart(ctx, canvas) {
        const width = canvas.width = canvas.offsetWidth;
        const height = canvas.height = 300;
        
        ctx.clearRect(0, 0, width, height);
        
        // Generate sample data (in real app, this would be actual motion data)
        const hours = 24;
        const data = Array.from({length: hours}, () => Math.floor(Math.random() * 20));
        
        const barWidth = width / hours;
        const maxValue = Math.max(...data);
        
        ctx.fillStyle = '#4a90e2';
        
        data.forEach((value, index) => {
            const barHeight = (value / maxValue) * (height - 40);
            const x = index * barWidth;
            const y = height - barHeight - 20;
            
            ctx.fillRect(x + 2, y, barWidth - 4, barHeight);
        });
        
        // Draw axis labels
        ctx.fillStyle = '#b0b0b0';
        ctx.font = '10px Arial';
        
        for (let i = 0; i < hours; i += 4) {
            ctx.fillText(`${i}:00`, i * barWidth, height - 5);
        }
    }

    updateActivityChart() {
        const canvas = document.getElementById('activityChart');
        if (canvas) {
            const ctx = canvas.getContext('2d');
            this.drawActivityChart(ctx, canvas);
        }
    }

    playRecording(id) {
        const recording = this.recordings.find(r => r.id === id);
        if (!recording) return;
        
        const modal = document.getElementById('videoModal');
        const player = document.getElementById('videoPlayer');
        
        player.src = recording.url;
        document.getElementById('videoDate').textContent = new Date(recording.timestamp).toLocaleString();
        document.getElementById('videoDuration').textContent = this.formatDuration(recording.duration);
        
        modal.classList.add('active');
        player.play();
    }

    downloadRecording(id) {
        const recording = this.recordings.find(r => r.id === id);
        if (!recording) return;
        
        const link = document.createElement('a');
        link.download = `recording_${recording.id}.webm`;
        link.href = recording.url;
        link.click();
    }

    deleteRecording(id) {
        if (!confirm('Are you sure you want to delete this recording?')) return;
        
        const index = this.recordings.findIndex(r => r.id === id);
        if (index !== -1) {
            URL.revokeObjectURL(this.recordings[index].url);
            this.recordings.splice(index, 1);
            this.saveRecordingsMetadata();
            this.updateRecordingsList();
            this.updateDashboard();
            this.showNotification('Recording Deleted', 'Recording removed successfully');
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

    viewAlert(id) {
        const alert = this.alerts.find(a => a.id === id);
        if (!alert) return;
        
        // Show alert details (could open a modal with more info)
        this.showNotification('Alert Details', `Motion detected at ${new Date(alert.timestamp).toLocaleString()}`);
    }

    clearAllRecordings() {
        if (!confirm('Are you sure you want to delete all recordings?')) return;
        
        this.recordings.forEach(recording => {
            URL.revokeObjectURL(recording.url);
        });
        
        this.recordings = [];
        this.saveRecordingsMetadata();
        this.updateRecordingsList();
        this.updateDashboard();
        this.showNotification('All Recordings Cleared', 'All recordings have been deleted');
    }

    filterRecordings(filter) {
        // Implementation for filtering recordings by date
        console.log('Filter recordings by:', filter);
        // This would filter the recordings list based on the selected date range
    }

    openSettings() {
        document.getElementById('settingsModal').classList.add('active');
    }

    saveSettings() {
        const settings = {
            videoQuality: document.getElementById('videoQuality').value,
            frameRate: document.getElementById('frameRate').value,
            maxStorage: document.getElementById('maxStorage').value,
            autoDelete: document.getElementById('autoDelete').checked,
            pushNotifications: document.getElementById('pushNotifications').checked,
            emailAlerts: document.getElementById('emailAlerts').checked
        };
        
        localStorage.setItem('cameraSettings', JSON.stringify(settings));
        document.getElementById('settingsModal').classList.remove('active');
        this.showNotification('Settings Saved', 'Your settings have been updated');
        
        // Apply settings
        this.applySettings(settings);
    }

    resetSettings() {
        if (!confirm('Reset all settings to default?')) return;
        
        localStorage.removeItem('cameraSettings');
        this.loadSettings();
        this.showNotification('Settings Reset', 'Settings have been reset to defaults');
    }

    loadSettings() {
        const savedSettings = localStorage.getItem('cameraSettings');
        if (savedSettings) {
            const settings = JSON.parse(savedSettings);
            document.getElementById('videoQuality').value = settings.videoQuality || 'medium';
            document.getElementById('frameRate').value = settings.frameRate || '30';
            document.getElementById('maxStorage').value = settings.maxStorage || '500';
            document.getElementById('autoDelete').checked = settings.autoDelete || false;
            document.getElementById('pushNotifications').checked = settings.pushNotifications || false;
            document.getElementById('emailAlerts').checked = settings.emailAlerts || false;
        }
    }

    applySettings(settings) {
        // Apply video quality settings
        if (settings.videoQuality) {
            this.changeVideoQuality(settings.videoQuality);
        }
    }

    async changeVideoQuality(quality) {
        const constraints = {
            low: { width: 640, height: 480 },
            medium: { width: 1280, height: 720 },
            high: { width: 1920, height: 1080 }
        };
        
        if (this.currentStream) {
            const videoTrack = this.currentStream.getVideoTracks()[0];
            if (videoTrack) {
                await videoTrack.applyConstraints(constraints[quality]);
            }
        }
    }

    startTimeUpdate() {
        setInterval(() => {
            const timestamp = document.getElementById('timestamp');
            if (timestamp) {
                timestamp.textContent = new Date().toLocaleTimeString();
            }
        }, 1000);
    }

    updateNotificationBadge() {
        const badge = document.getElementById('notificationBadge');
        const unreadAlerts = this.alerts.filter(a => !a.read).length;
        badge.textContent = unreadAlerts;
        badge.style.display = unreadAlerts > 0 ? 'block' : 'none';
    }

    async requestNotificationPermission() {
        if ('Notification' in window) {
            const permission = await Notification.requestPermission();
            console.log('Notification permission:', permission);
        }
    }

    showNotification(title, body) {
        // Browser notification
        if ('Notification' in window && Notification.permission === 'granted') {
            new Notification(title, {
                body: body,
                icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><text y="20" font-size="20">🔐</text></svg>',
                badge: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><text y="20" font-size="20">📹</text></svg>'
            });
        }
        
        // In-app notification
        this.showToast(title, body);
    }

    showToast(title, message) {
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.innerHTML = `
            <strong>${title}</strong>
            <span>${message}</span>
        `;
        
        // Add toast styles
        toast.style.cssText = `
            position: fixed;
            bottom: 100px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(0,0,0,0.9);
            color: white;
            padding: 1rem 1.5rem;
            border-radius: 8px;
            z-index: 10000;
            animation: slideUp 0.3s ease-out;
        `;
        
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.style.animation = 'slideDown 0.3s ease-out';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    playAlertSound() {
        // Create and play alert sound
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.value = 800;
        oscillator.type = 'sine';
        
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.5);
    }

    saveRecordingsMetadata() {
        // Save metadata only (not the actual blobs)
        const metadata = this.recordings.map(r => ({
            id: r.id,
            timestamp: r.timestamp,
            duration: r.duration,
            size: r.size,
            thumbnail: r.thumbnail
        }));
        
        try {
            localStorage.setItem('recordingsMetadata', JSON.stringify(metadata));
        } catch (e) {
            console.error('Failed to save recordings metadata:', e);
            if (e.name === 'QuotaExceededError') {
                this.showNotification('Storage Full', 'Please delete some recordings to free up space');
            }
        }
    }

    saveAlerts() {
        try {
            localStorage.setItem('alerts', JSON.stringify(this.alerts.slice(0, 50))); // Keep last 50 alerts
        } catch (e) {
            console.error('Failed to save alerts:', e);
        }
    }

    loadSavedData() {
        // Load settings
        this.loadSettings();
        
        // Load alerts
        const savedAlerts = localStorage.getItem('alerts');
        if (savedAlerts) {
            this.alerts = JSON.parse(savedAlerts);
        }
        
        // Note: Actual video recordings can't be persisted in localStorage
        // In a real app, you'd upload them to a server
    }

    updateUI() {
        this.updateRecordingsList();
        this.updateAlertsList();
        this.updateDashboard();
        this.updateNotificationBadge();
    }

    formatDuration(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.app = new SecurityCameraApp();
});

// Handle page visibility changes
document.addEventListener('visibilitychange', () => {
    if (document.hidden && window.app && window.app.isRecording) {
        // Optionally stop recording when page is hidden
        console.log('Page hidden, recording continues in background');
    }
});

// Service Worker registration for PWA support
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').then(registration => {
        console.log('Service Worker registered:', registration);
    }).catch(error => {
        console.log('Service Worker registration failed:', error);
    });
            }
