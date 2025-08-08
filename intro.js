// Intro and Loading Management
class IntroManager {
    constructor() {
        this.loadingProgress = 0;
        this.assetsToLoad = [
            'assets/file_000000007d6061fd901ccfe963c7d569.png', // Logo
            'assets/file_00000000715c61f8aaec03884fabb575.png', // Scene 1
            'assets/file_000000001e3462308102f8b9c449e32f.png'  // Scene 2
        ];
        this.loadedAssets = 0;
        this.termsAccepted = false;
        
        // Check if user has already accepted terms
        this.checkPreviousTermsAcceptance();
    }
    
    checkPreviousTermsAcceptance() {
        const termsAccepted = localStorage.getItem('termsAccepted');
        const termsAcceptedDate = localStorage.getItem('termsAcceptedDate');
        
        // Terms are valid for 30 days
        if (termsAccepted === 'true' && termsAcceptedDate) {
            const acceptedDate = new Date(termsAcceptedDate);
            const now = new Date();
            const daysDiff = (now - acceptedDate) / (1000 * 60 * 60 * 24);
            
            if (daysDiff < 30) {
                this.termsAccepted = true;
            }
        }
    }
    
    async start() {
        // Start loading assets
        await this.loadAssets();
        
        // If terms were previously accepted, skip to intro scenes
        if (this.termsAccepted) {
            await this.hideLoadingScreen();
            await this.playIntroScenes();
            this.showMainApp();
        } else {
            // Show terms screen
            await this.hideLoadingScreen();
            await this.playIntroScenes();
            this.showTermsScreen();
        }
    }
    
    async loadAssets() {
        const loadingBar = document.querySelector('.loading-bar-fill');
        const loadingPercent = document.getElementById('loadingPercent');
        
        for (let i = 0; i < this.assetsToLoad.length; i++) {
            await this.loadImage(this.assetsToLoad[i]);
            this.loadedAssets++;
            
            // Update progress
            this.loadingProgress = Math.round((this.loadedAssets / this.assetsToLoad.length) * 100);
            
            if (loadingBar) {
                loadingBar.style.width = `${this.loadingProgress}%`;
            }
            if (loadingPercent) {
                loadingPercent.textContent = `${this.loadingProgress}%`;
            }
            
            // Add small delay for visual effect
            await this.delay(300);
        }
        
        // Ensure 100% is shown
        if (loadingBar) {
            loadingBar.style.width = '100%';
        }
        if (loadingPercent) {
            loadingPercent.textContent = '100%';
        }
        
        await this.delay(500); // Show complete loading bar briefly
    }
    
    loadImage(src) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve();
            img.onerror = () => {
                console.warn(`Failed to load image: ${src}`);
                resolve(); // Continue even if image fails
            };
            img.src = src;
        });
    }
    
    async hideLoadingScreen() {
        const loadingScreen = document.getElementById('loadingScreen');
        if (loadingScreen) {
            loadingScreen.style.opacity = '0';
            await this.delay(500);
            loadingScreen.style.display = 'none';
            loadingScreen.classList.remove('active');
        }
    }
    
    async playIntroScenes() {
        const introScenes = document.getElementById('introScenes');
        const scene1 = document.getElementById('scene1');
        const scene2 = document.getElementById('scene2');
        
        if (!introScenes || !scene1 || !scene2) return;
        
        // Show intro container
        introScenes.style.display = 'block';
        
        // Play Scene 1
        scene1.style.display = 'flex';
        scene1.style.opacity = '0';
        await this.delay(100);
        scene1.style.opacity = '1';
        await this.delay(2000); // Display for 2 seconds
        scene1.style.opacity = '0';
        await this.delay(500);
        scene1.style.display = 'none';
        
        // Play Scene 2
        scene2.style.display = 'flex';
        scene2.style.opacity = '0';
        await this.delay(100);
        scene2.style.opacity = '1';
        await this.delay(2000); // Display for 2 seconds
        scene2.style.opacity = '0';
        await this.delay(500);
        scene2.style.display = 'none';
        
        // Hide intro container
        introScenes.style.display = 'none';
    }
    
    showTermsScreen() {
        const termsScreen = document.getElementById('termsScreen');
        const acceptCheckbox = document.getElementById('acceptTerms');
        const continueBtn = document.getElementById('continueBtn');
        
        if (!termsScreen) return;
        
        // Show terms screen
        termsScreen.style.display = 'flex';
        termsScreen.style.opacity = '0';
        setTimeout(() => {
            termsScreen.style.opacity = '1';
        }, 100);
        
        // Handle checkbox change
        if (acceptCheckbox) {
            acceptCheckbox.addEventListener('change', (e) => {
                if (continueBtn) {
                    continueBtn.disabled = !e.target.checked;
                    if (e.target.checked) {
                        continueBtn.classList.add('enabled');
                    } else {
                        continueBtn.classList.remove('enabled');
                    }
                }
            });
        }
        
        // Handle continue button
        if (continueBtn) {
            continueBtn.addEventListener('click', () => {
                if (acceptCheckbox && acceptCheckbox.checked) {
                    // Save acceptance
                    localStorage.setItem('termsAccepted', 'true');
                    localStorage.setItem('termsAcceptedDate', new Date().toISOString());
                    
                    // Hide terms and show app
                    this.hideTermsScreen();
                    this.showMainApp();
                }
            });
        }
    }
    
    async hideTermsScreen() {
        const termsScreen = document.getElementById('termsScreen');
        if (termsScreen) {
            termsScreen.style.opacity = '0';
            await this.delay(500);
            termsScreen.style.display = 'none';
        }
    }
    
    showMainApp() {
        const app = document.getElementById('app');
        if (app) {
            app.style.display = 'flex';
            app.style.opacity = '0';
            setTimeout(() => {
                app.style.opacity = '1';
            }, 100);
            
            // Initialize main app if it hasn't been initialized
            if (typeof window.initializeMainApp === 'function') {
                window.initializeMainApp();
            }
        }
    }
    
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Start intro sequence when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    const introManager = new IntroManager();
    introManager.start();
});

// Flag to prevent double initialization
window.appInitialized = false;

// Function to initialize main app (called from intro manager)
window.initializeMainApp = function() {
    if (!window.appInitialized && typeof MotionSecurityCamera !== 'undefined') {
        console.log('Initializing main application...');
        window.app = new MotionSecurityCamera();
        window.appInitialized = true;
    }
};
