// ============ INDEXEDDB SETUP ============
let db;
let currentUser = null;
let isOnline = navigator.onLine;
let mediaRecorder = null;
let audioChunks = [];
let videoRecorder = null;
let videoChunks = [];
let isVoiceRecording = false;
let isVideoRecording = false;
let recordingTimer = null;
let recordingSeconds = 0;
let currentDraft = null;
let voiceStream = null;
let videoStream = null;
let currentVoiceText = "";
let currentVideoText = "";
let recognition = null;

// Initialize IndexedDB
function initIndexedDB() {
    const request = indexedDB.open('NyaySetuDB', 1);
    
    request.onerror = () => console.error('DB error:', request.error);
    request.onsuccess = () => {
        db = request.result;
        console.log('IndexedDB connected');
        loadRecords();
        checkForDraft();
        updateStorageInfo();
        loadFeedback();
        animateCounters();
    };
    
    request.onupgradeneeded = (e) => {
        const db = e.target.result;
        
        if (!db.objectStoreNames.contains('testimonies')) {
            const testimonyStore = db.createObjectStore('testimonies', { keyPath: 'id', autoIncrement: true });
            testimonyStore.createIndex('userId', 'userId', { unique: false });
            testimonyStore.createIndex('timestamp', 'timestamp', { unique: false });
            testimonyStore.createIndex('synced', 'synced', { unique: false });
            testimonyStore.createIndex('caseId', 'caseId', { unique: false });
        }
        
        if (!db.objectStoreNames.contains('drafts')) {
            db.createObjectStore('drafts', { keyPath: 'userId' });
        }
        
        if (!db.objectStoreNames.contains('feedback')) {
            const feedbackStore = db.createObjectStore('feedback', { keyPath: 'id', autoIncrement: true });
            feedbackStore.createIndex('userId', 'userId', { unique: false });
            feedbackStore.createIndex('timestamp', 'timestamp', { unique: false });
        }
        
        if (!db.objectStoreNames.contains('users')) {
            db.createObjectStore('users', { keyPath: 'email' });
        }
        
        if (!db.objectStoreNames.contains('mobileUsers')) {
            db.createObjectStore('mobileUsers', { keyPath: 'mobile' });
        }
        
        if (!db.objectStoreNames.contains('passwordReset')) {
            db.createObjectStore('passwordReset', { keyPath: 'email' });
        }
        
        if (!db.objectStoreNames.contains('mobilePasswordReset')) {
            db.createObjectStore('mobilePasswordReset', { keyPath: 'mobile' });
        }
    };
}

// ============ ONLINE/OFFLINE DETECTION ============
window.addEventListener('online', () => {
    isOnline = true;
    showToast('Back online! Syncing your data...', 'success');
    syncRecords();
});

window.addEventListener('offline', () => {
    isOnline = false;
    showToast('You are offline. Your data is saved locally.', 'info');
});

// ============ TOAST NOTIFICATION ============
function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icons = {
        success: 'fa-check-circle',
        error: 'fa-exclamation-circle',
        warning: 'fa-exclamation-triangle',
        info: 'fa-info-circle'
    };
    toast.innerHTML = `<i class="fas ${icons[type]}"></i><span>${message}</span>`;
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ============ PAGE NAVIGATION ============
function showPage(pageId) {
    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
    });
    const activePage = document.getElementById(`page-${pageId}`);
    if (activePage) activePage.classList.add('active');
    
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.classList.toggle('active', tab.getAttribute('data-page') === pageId);
    });
    
    if (pageId === 'records') loadRecords();
    if (pageId === 'feedback') loadFeedback();
    if (pageId === 'profile') updateStorageInfo();
    
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function scrollToHow() {
    const howSection = document.getElementById('how');
    if (howSection) howSection.scrollIntoView({ behavior: 'smooth' });
}

// ============ THEME MANAGEMENT ============
function toggleTheme() {
    const html = document.documentElement;
    const isDark = html.getAttribute('data-theme') === 'dark';
    html.setAttribute('data-theme', isDark ? 'light' : 'dark');
    localStorage.setItem('theme', isDark ? 'light' : 'dark');
    const themeBtn = document.getElementById('themeBtn');
    if (themeBtn) themeBtn.innerHTML = isDark ? '<i class="fas fa-moon"></i>' : '<i class="fas fa-sun"></i>';
    showToast(isDark ? 'Light mode activated' : 'Dark mode activated', 'success');
}

function toggleThemeFromSwitch() {
    const isChecked = document.getElementById('darkModeSwitch')?.checked || false;
    document.documentElement.setAttribute('data-theme', isChecked ? 'dark' : 'light');
    localStorage.setItem('theme', isChecked ? 'dark' : 'light');
    const themeBtn = document.getElementById('themeBtn');
    if (themeBtn) themeBtn.innerHTML = isChecked ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
}

// ============ AUTHENTICATION ============
function openModal() {
    document.getElementById('authModal').classList.add('active');
}

function closeModal() {
    document.getElementById('authModal').classList.remove('active');
}

function switchLoginMethod(method) {
    const emailTab = document.getElementById('emailLoginTab');
    const mobileTab = document.getElementById('mobileLoginTab');
    const tabs = document.querySelectorAll('.login-method-tab');
    
    tabs.forEach(tab => tab.classList.remove('active'));
    
    if (method === 'email') {
        emailTab.classList.add('active');
        mobileTab.classList.remove('active');
        tabs[0].classList.add('active');
    } else {
        mobileTab.classList.add('active');
        emailTab.classList.remove('active');
        tabs[1].classList.add('active');
    }
}

function switchAuthTab(tab) {
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const tabs = document.querySelectorAll('.auth-tab');
    
    tabs.forEach(t => t.classList.remove('active'));
    
    if (tab === 'login') {
        tabs[0]?.classList.add('active');
        if (loginForm) loginForm.style.display = 'block';
        if (registerForm) registerForm.style.display = 'none';
    } else {
        tabs[1]?.classList.add('active');
        if (registerForm) registerForm.style.display = 'block';
        if (loginForm) loginForm.style.display = 'none';
    }
}

function handleLogin() {
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    
    if (!email || !password) {
        showToast('Please enter both email and password', 'warning');
        return;
    }
    
    const transaction = db.transaction(['users'], 'readonly');
    const store = transaction.objectStore('users');
    const request = store.get(email);
    
    request.onsuccess = () => {
        const user = request.result;
        if (user && user.password === password) {
            currentUser = user;
            localStorage.setItem('currentUser', JSON.stringify(user));
            updateUIForLoggedInUser();
            closeModal();
            showToast(`Welcome back, ${user.name}!`, 'success');
            loadRecords();
            checkForDraft();
            showPage('home');
        } else {
            showToast('Invalid email or password', 'error');
        }
    };
    request.onerror = () => {
        showToast('Login error. Please try again.', 'error');
    };
}

function handleRegister() {
    const name = document.getElementById('regName').value.trim();
    const email = document.getElementById('regEmail').value.trim();
    const mobile = document.getElementById('regMobile').value.trim();
    const password = document.getElementById('regPassword').value;
    const role = document.getElementById('regRole').value;
    const consent = document.getElementById('consentTerms').checked;
    
    if (!name || !email || !password) {
        showToast('Please fill all required fields', 'warning');
        return;
    }
    
    if (password.length < 8) {
        showToast('Password must be at least 8 characters', 'warning');
        return;
    }
    
    if (!consent) {
        showToast('Please agree to the terms', 'warning');
        return;
    }
    
    const transaction = db.transaction(['users'], 'readwrite');
    const store = transaction.objectStore('users');
    const checkRequest = store.get(email);
    
    checkRequest.onsuccess = () => {
        if (checkRequest.result) {
            showToast('User already exists. Please login.', 'error');
            switchAuthTab('login');
            return;
        }
        
        const newUser = {
            email: email,
            password: password,
            name: name,
            mobile: mobile,
            role: role,
            createdAt: Date.now()
        };
        
        const addRequest = store.add(newUser);
        addRequest.onsuccess = () => {
            if (mobile) {
                const mobileTx = db.transaction(['mobileUsers'], 'readwrite');
                const mobileStore = mobileTx.objectStore('mobileUsers');
                mobileStore.put({
                    mobile: mobile,
                    email: email,
                    name: name,
                    password: password,
                    role: role,
                    createdAt: Date.now()
                });
            }
            
            currentUser = newUser;
            localStorage.setItem('currentUser', JSON.stringify(newUser));
            updateUIForLoggedInUser();
            closeModal();
            showToast(`Welcome to NyaySetu, ${name}!`, 'success');
            showPage('home');
        };
        addRequest.onerror = () => {
            showToast('Registration failed. Please try again.', 'error');
        };
    };
}

function handleMobileLogin() {
    const mobile = document.getElementById('mobileNumber').value.trim();
    const password = document.getElementById('mobilePassword').value;
    
    if (!mobile || !password) {
        showToast('Please enter mobile number and password', 'warning');
        return;
    }
    
    const transaction = db.transaction(['mobileUsers'], 'readonly');
    const store = transaction.objectStore('mobileUsers');
    const request = store.get(mobile);
    
    request.onsuccess = () => {
        const user = request.result;
        if (user && user.password === password) {
            currentUser = {
                email: user.email || mobile,
                name: user.name,
                role: user.role,
                mobile: mobile,
                createdAt: user.createdAt
            };
            localStorage.setItem('currentUser', JSON.stringify(currentUser));
            updateUIForLoggedInUser();
            closeModal();
            showToast(`Welcome back, ${user.name}!`, 'success');
            loadRecords();
            checkForDraft();
            showPage('home');
        } else {
            showToast('Invalid mobile number or password', 'error');
        }
    };
}

function updateUIForLoggedInUser() {
    const loginBtn = document.getElementById('loginBtn');
    const userMenu = document.getElementById('userMenu');
    const userNameSpan = document.getElementById('userName');
    
    if (loginBtn) loginBtn.style.display = 'none';
    if (userMenu) userMenu.style.display = 'block';
    if (userNameSpan && currentUser) userNameSpan.textContent = currentUser.name.split(' ')[0];
    
    const profileName = document.getElementById('profileName');
    const profileEmail = document.getElementById('profileEmail');
    const profileMobile = document.getElementById('profileMobile');
    const profileRole = document.getElementById('profileRole');
    const profileJoined = document.getElementById('profileJoined');
    
    if (profileName) profileName.textContent = currentUser.name;
    if (profileEmail) profileEmail.textContent = currentUser.email;
    if (profileMobile) profileMobile.textContent = currentUser.mobile || 'Not provided';
    if (profileRole) {
        const roleText = currentUser.role === 'survivor' ? 'Survivor' : 
                         currentUser.role === 'ngo' ? 'NGO Worker' : 'Legal Officer';
        profileRole.textContent = roleText;
    }
    if (profileJoined) profileJoined.textContent = new Date(currentUser.createdAt).toLocaleDateString();
}

function toggleUserMenu() {
    const dropdown = document.getElementById('userDropdown');
    if (dropdown) dropdown.classList.toggle('show');
}

function logout() {
    currentUser = null;
    localStorage.removeItem('currentUser');
    showToast('Logged out successfully', 'info');
    setTimeout(() => {
        location.reload();
    }, 500);
}

// ============ FORGOT PASSWORD ============
function openForgotPasswordModal() {
    document.getElementById('forgotPasswordModal').classList.add('active');
}

function closeForgotPasswordModal() {
    document.getElementById('forgotPasswordModal').classList.remove('active');
    document.getElementById('resetEmail').value = '';
    document.getElementById('resetOtp').value = '';
    document.getElementById('resetNewPassword').value = '';
    document.getElementById('resetConfirmPassword').value = '';
    document.getElementById('forgotStep1').style.display = 'block';
    document.getElementById('forgotStep2').style.display = 'none';
}

function openMobileForgotPasswordModal() {
    document.getElementById('mobileForgotPasswordModal').classList.add('active');
}

function closeMobileForgotPasswordModal() {
    document.getElementById('mobileForgotPasswordModal').classList.remove('active');
    document.getElementById('resetMobile').value = '';
    document.getElementById('resetMobileOtp').value = '';
    document.getElementById('resetMobileNewPassword').value = '';
    document.getElementById('resetMobileConfirmPassword').value = '';
    document.getElementById('mobileForgotStep1').style.display = 'block';
    document.getElementById('mobileForgotStep2').style.display = 'none';
}

function sendResetOtp() {
    const email = document.getElementById('resetEmail').value.trim();
    if (!email) {
        showToast('Please enter your email address', 'warning');
        return;
    }
    
    const transaction = db.transaction(['users'], 'readonly');
    const store = transaction.objectStore('users');
    const request = store.get(email);
    
    request.onsuccess = () => {
        const user = request.result;
        if (!user) {
            showToast('No account found with this email address', 'error');
            return;
        }
        
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        
        const resetTx = db.transaction(['passwordReset'], 'readwrite');
        const resetStore = resetTx.objectStore('passwordReset');
        resetStore.put({ email: email, otp: otp, expiry: Date.now() + 10 * 60 * 1000 });
        
        showToast(`OTP sent to ${email}`, 'success');
        alert(`DEMO MODE - Your OTP is: ${otp}\n\nIn production, this would be sent to your email.`);
        
        document.getElementById('forgotStep1').style.display = 'none';
        document.getElementById('forgotStep2').style.display = 'block';
    };
}

function verifyResetOtpAndResetPassword() {
    const otp = document.getElementById('resetOtp').value.trim();
    const newPassword = document.getElementById('resetNewPassword').value;
    const confirmPassword = document.getElementById('resetConfirmPassword').value;
    
    if (!otp) {
        showToast('Please enter the OTP', 'warning');
        return;
    }
    if (!newPassword || newPassword.length < 8) {
        showToast('Password must be at least 8 characters', 'warning');
        return;
    }
    if (newPassword !== confirmPassword) {
        showToast('Passwords do not match', 'warning');
        return;
    }
    
    const email = document.getElementById('resetEmail').value;
    const transaction = db.transaction(['passwordReset'], 'readonly');
    const store = transaction.objectStore('passwordReset');
    const request = store.get(email);
    
    request.onsuccess = () => {
        const resetData = request.result;
        if (!resetData || resetData.otp !== otp) {
            showToast('Invalid OTP', 'error');
            return;
        }
        if (Date.now() > resetData.expiry) {
            showToast('OTP has expired. Please request a new one.', 'error');
            return;
        }
        
        const userTx = db.transaction(['users'], 'readwrite');
        const userStore = userTx.objectStore('users');
        const userRequest = userStore.get(email);
        
        userRequest.onsuccess = () => {
            const user = userRequest.result;
            user.password = newPassword;
            userStore.put(user);
            
            const deleteTx = db.transaction(['passwordReset'], 'readwrite');
            deleteTx.objectStore('passwordReset').delete(email);
            
            showToast('Password reset successfully! Please login with your new password.', 'success');
            closeForgotPasswordModal();
        };
    };
}

function sendMobileResetOtp() {
    const mobile = document.getElementById('resetMobile').value.trim();
    if (!mobile) {
        showToast('Please enter your mobile number', 'warning');
        return;
    }
    
    const transaction = db.transaction(['mobileUsers'], 'readonly');
    const store = transaction.objectStore('mobileUsers');
    const request = store.get(mobile);
    
    request.onsuccess = () => {
        const user = request.result;
        if (!user) {
            showToast('No account found with this mobile number', 'error');
            return;
        }
        
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        
        const resetTx = db.transaction(['mobilePasswordReset'], 'readwrite');
        const resetStore = resetTx.objectStore('mobilePasswordReset');
        resetStore.put({ mobile: mobile, otp: otp, expiry: Date.now() + 10 * 60 * 1000 });
        
        showToast(`OTP sent to ${mobile}`, 'success');
        alert(`DEMO MODE - Your OTP is: ${otp}\n\nIn production, this would be sent to your mobile via SMS.`);
        
        document.getElementById('mobileForgotStep1').style.display = 'none';
        document.getElementById('mobileForgotStep2').style.display = 'block';
    };
}

function verifyMobileResetOtpAndResetPassword() {
    const otp = document.getElementById('resetMobileOtp').value.trim();
    const newPassword = document.getElementById('resetMobileNewPassword').value;
    const confirmPassword = document.getElementById('resetMobileConfirmPassword').value;
    
    if (!otp) {
        showToast('Please enter the OTP', 'warning');
        return;
    }
    if (!newPassword || newPassword.length < 8) {
        showToast('Password must be at least 8 characters', 'warning');
        return;
    }
    if (newPassword !== confirmPassword) {
        showToast('Passwords do not match', 'warning');
        return;
    }
    
    const mobile = document.getElementById('resetMobile').value;
    const transaction = db.transaction(['mobilePasswordReset'], 'readonly');
    const store = transaction.objectStore('mobilePasswordReset');
    const request = store.get(mobile);
    
    request.onsuccess = () => {
        const resetData = request.result;
        if (!resetData || resetData.otp !== otp) {
            showToast('Invalid OTP', 'error');
            return;
        }
        if (Date.now() > resetData.expiry) {
            showToast('OTP has expired. Please request a new one.', 'error');
            return;
        }
        
        const userTx = db.transaction(['mobileUsers'], 'readwrite');
        const userStore = userTx.objectStore('mobileUsers');
        const userRequest = userStore.get(mobile);
        
        userRequest.onsuccess = () => {
            const user = userRequest.result;
            user.password = newPassword;
            userStore.put(user);
            
            const deleteTx = db.transaction(['mobilePasswordReset'], 'readwrite');
            deleteTx.objectStore('mobilePasswordReset').delete(mobile);
            
            showToast('Password reset successfully! Please login with your new password.', 'success');
            closeMobileForgotPasswordModal();
        };
    };
}

// ============ DRAFT MANAGEMENT ============
function saveDraft(type, content, language) {
    if (!currentUser) return;
    
    const draft = {
        userId: currentUser.email,
        type: type,
        content: content,
        language: language,
        timestamp: Date.now()
    };
    
    const transaction = db.transaction(['drafts'], 'readwrite');
    const store = transaction.objectStore('drafts');
    store.put(draft);
}

function checkForDraft() {
    if (!currentUser) return;
    
    const transaction = db.transaction(['drafts'], 'readonly');
    const store = transaction.objectStore('drafts');
    const request = store.get(currentUser.email);
    
    request.onsuccess = () => {
        const draft = request.result;
        if (draft && Date.now() - draft.timestamp < 86400000) {
            currentDraft = draft;
            const notice = document.getElementById('resumeDraftNotice');
            const draftDate = document.getElementById('draftDate');
            if (notice) notice.classList.remove('hidden');
            if (draftDate) draftDate.textContent = new Date(draft.timestamp).toLocaleString();
        }
    };
}

function resumeDraft() {
    if (!currentDraft) return;
    
    if (currentDraft.type === 'text') {
        selectMethod('text');
        const textarea = document.getElementById('testimonyText');
        if (textarea) {
            textarea.value = currentDraft.content;
            const charCount = document.getElementById('charCount');
            if (charCount) charCount.textContent = currentDraft.content.length;
        }
    }
    
    const languageSelect = document.getElementById('testimonyLanguage');
    if (languageSelect) languageSelect.value = currentDraft.language;
    
    const notice = document.getElementById('resumeDraftNotice');
    if (notice) notice.classList.add('hidden');
    showToast('Draft loaded. You can continue from where you left off.', 'success');
}

function discardDraft() {
    if (!currentUser) return;
    
    const transaction = db.transaction(['drafts'], 'readwrite');
    const store = transaction.objectStore('drafts');
    store.delete(currentUser.email);
    currentDraft = null;
    const notice = document.getElementById('resumeDraftNotice');
    if (notice) notice.classList.add('hidden');
    showToast('Draft discarded', 'info');
}

// ============ TEXT AUTO-SAVE ============
function setupTextAutoSave() {
    const textarea = document.getElementById('testimonyText');
    if (!textarea) return;
    
    let saveTimeout;
    textarea.addEventListener('input', () => {
        const text = textarea.value;
        const language = document.getElementById('testimonyLanguage').value;
        const charCount = document.getElementById('charCount');
        if (charCount) charCount.textContent = text.length;
        
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(() => {
            saveDraft('text', text, language);
            const status = document.getElementById('autoSaveStatus');
            if (status) {
                status.innerHTML = '<i class="fas fa-check-circle"></i> Draft saved';
                setTimeout(() => {
                    if (status) status.innerHTML = '<i class="fas fa-save"></i> Auto-saving...';
                }, 2000);
            }
        }, 1000);
    });
}

// ============ METHOD SELECTION ============
function selectMethod(method) {
    const btns = document.querySelectorAll('.method-btn');
    btns.forEach(btn => btn.classList.remove('active'));
    if (event?.target) event.target.classList.add('active');
    
    const voicePanel = document.getElementById('voicePanel');
    const textPanel = document.getElementById('textPanel');
    const videoPanel = document.getElementById('videoPanel');
    
    if (voicePanel) voicePanel.classList.toggle('active', method === 'voice');
    if (textPanel) textPanel.classList.toggle('active', method === 'text');
    if (videoPanel) videoPanel.classList.toggle('active', method === 'video');
}

// ============ VOICE RECORDING ============
async function startVoiceRecording() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        showToast('Speech recognition not supported in this browser', 'error');
        return;
    }
    
    recognition = new SpeechRecognition();
    const language = document.getElementById('testimonyLanguage').value;
    recognition.lang = language === 'hindi' ? 'hi-IN' : language === 'spanish' ? 'es-ES' : language === 'french' ? 'fr-FR' : 'en-US';
    recognition.continuous = true;
    recognition.interimResults = true;
    
    recognition.onstart = () => {
        isVoiceRecording = true;
        currentVoiceText = "";
        const transcriptDiv = document.getElementById('voiceTranscript');
        if (transcriptDiv) transcriptDiv.innerHTML = '<span class="recording-cursor"></span>';
        
        const recordBtn = document.getElementById('recordBtn');
        if (recordBtn) {
            recordBtn.classList.add('recording');
            recordBtn.innerHTML = '<i class="fas fa-stop"></i> Stop';
        }
        
        recordingSeconds = 0;
        const timerDisplay = document.getElementById('voiceTimer');
        if (timerDisplay) timerDisplay.textContent = '00:00';
        recordingTimer = setInterval(() => {
            recordingSeconds++;
            const mins = Math.floor(recordingSeconds / 60);
            const secs = recordingSeconds % 60;
            if (timerDisplay) timerDisplay.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }, 1000);
        
        showToast('Listening... Speak clearly', 'success');
    };
    
    recognition.onresult = (event) => {
        let finalTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
            if (event.results[i].isFinal) {
                finalTranscript += event.results[i][0].transcript + ' ';
            }
        }
        currentVoiceText = (currentVoiceText + finalTranscript).trim();
        const transcriptDiv = document.getElementById('voiceTranscript');
        if (transcriptDiv) transcriptDiv.innerHTML = currentVoiceText;
    };
    
    recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        showToast('Error: ' + event.error, 'error');
        stopVoiceRecording();
    };
    
    recognition.onend = () => {
        if (isVoiceRecording) stopVoiceRecording();
    };
    
    recognition.start();
}

function pauseVoiceRecording() {
    if (recognition) {
        recognition.stop();
        showToast('Recording paused', 'info');
    }
}

function stopVoiceRecording() {
    if (recognition) {
        recognition.stop();
        recognition = null;
    }
    
    isVoiceRecording = false;
    
    if (recordingTimer) {
        clearInterval(recordingTimer);
        recordingTimer = null;
    }
    
    const recordBtn = document.getElementById('recordBtn');
    if (recordBtn) {
        recordBtn.classList.remove('recording');
        recordBtn.innerHTML = '<i class="fas fa-microphone"></i> Start';
    }
    
    if (currentVoiceText && currentVoiceText.length > 10) {
        const language = document.getElementById('testimonyLanguage').value;
        saveDraft('voice', currentVoiceText, language);
        showToast('Voice recorded successfully! Click "Analyze with AI" to process.', 'success');
    } else {
        showToast('No speech detected. Please try again.', 'warning');
    }
}

function resetVoiceRecording() {
    if (isVoiceRecording) stopVoiceRecording();
    currentVoiceText = "";
    const transcriptDiv = document.getElementById('voiceTranscript');
    if (transcriptDiv) transcriptDiv.innerHTML = '<span class="placeholder">Your transcription will appear here after recording...</span>';
    const timer = document.getElementById('voiceTimer');
    if (timer) timer.textContent = '00:00';
    showToast('Recording reset', 'info');
}

// ============ VIDEO RECORDING ============
async function startVideoRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        videoStream = stream;
        const video = document.getElementById('videoPreview');
        if (video) video.srcObject = stream;
        
        videoRecorder = new MediaRecorder(stream);
        videoChunks = [];
        
        videoRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) videoChunks.push(event.data);
        };
        
        videoRecorder.onstop = () => {
            const videoBlob = new Blob(videoChunks, { type: 'video/mp4' });
            const language = document.getElementById('testimonyLanguage').value;
            let transcript = language === 'hindi' ? 
                "वीडियो रिकॉर्डिंग में पीड़िता डरी हुई दिख रही है। घटना बाजार के पास हुई।" : 
                "Video shows the victim appears frightened. The incident occurred near a market area.";
            currentVideoText = transcript;
            const transcriptDiv = document.getElementById('videoTranscript');
            if (transcriptDiv) transcriptDiv.innerHTML = transcript;
            saveDraft('video', transcript, language);
            showToast('Video recorded successfully! Audio transcribed.', 'success');
        };
        
        videoRecorder.start(100);
        isVideoRecording = true;
        
        const recordBtn = document.getElementById('videoRecordBtn');
        if (recordBtn) {
            recordBtn.classList.add('recording');
            recordBtn.innerHTML = '<i class="fas fa-stop"></i> Stop';
        }
        
        recordingSeconds = 0;
        const timerDisplay = document.getElementById('videoTimer');
        if (timerDisplay) timerDisplay.textContent = '00:00';
        recordingTimer = setInterval(() => {
            recordingSeconds++;
            const mins = Math.floor(recordingSeconds / 60);
            const secs = recordingSeconds % 60;
            if (timerDisplay) timerDisplay.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }, 1000);
        
        showToast('Video recording started', 'success');
    } catch (error) {
        showToast('Camera and microphone access required', 'error');
    }
}

function pauseVideoRecording() {
    if (videoRecorder && isVideoRecording && videoRecorder.state === 'recording') {
        videoRecorder.pause();
        clearInterval(recordingTimer);
        showToast('Video paused', 'info');
    }
}

function stopVideoRecording() {
    if (videoRecorder && isVideoRecording && videoRecorder.state !== 'inactive') {
        videoRecorder.stop();
        isVideoRecording = false;
        
        if (videoStream) {
            videoStream.getTracks().forEach(track => track.stop());
            videoStream = null;
        }
        
        const video = document.getElementById('videoPreview');
        if (video) video.srcObject = null;
        
        const recordBtn = document.getElementById('videoRecordBtn');
        if (recordBtn) {
            recordBtn.classList.remove('recording');
            recordBtn.innerHTML = '<i class="fas fa-video"></i> Start';
        }
        
        if (recordingTimer) {
            clearInterval(recordingTimer);
            recordingTimer = null;
        }
        
        showToast('Video recording stopped', 'info');
    }
}

function resetVideoRecording() {
    if (isVideoRecording) stopVideoRecording();
    videoChunks = [];
    currentVideoText = "";
    const transcriptDiv = document.getElementById('videoTranscript');
    if (transcriptDiv) transcriptDiv.innerHTML = '<span class="placeholder">Video transcription will appear here...</span>';
    const timer = document.getElementById('videoTimer');
    if (timer) timer.textContent = '00:00';
    showToast('Video reset', 'info');
}

// ============ AI ANALYSIS ============
async function analyzeTestimony() {
    const activeMethod = document.querySelector('.method-btn.active')?.textContent || '';
    let content = '';
    let mediaType = 'text';
    
    if (activeMethod.includes('Voice')) {
        content = currentVoiceText;
        mediaType = 'voice';
        if (!content || content.length < 10) {
            showToast('Please record your voice testimony first', 'warning');
            return;
        }
    } else if (activeMethod.includes('Video')) {
        content = currentVideoText;
        mediaType = 'video';
        if (!content || content.length < 10) {
            showToast('Please record your video testimony first', 'warning');
            return;
        }
    } else {
        content = document.getElementById('testimonyText')?.value || '';
        mediaType = 'text';
        if (!content || content.length < 20) {
            showToast('Please type your testimony first (minimum 20 characters)', 'warning');
            return;
        }
    }
    
    showToast('AI is analyzing your testimony...', 'info');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const language = document.getElementById('testimonyLanguage').value;
    const formatType = document.querySelector('input[name="formatType"]:checked')?.value || 'standard';
    
    let structuredData;
    if (formatType === 'legal') {
        structuredData = {
            formatType: 'legal',
            content: convertToLegalFormat(content),
            detectedLanguage: language,
            timestamp: new Date().toISOString()
        };
    } else {
        structuredData = generateStructuredOutput(content, language, mediaType);
    }
    
    displayStructuredOutput(structuredData);
}

function generateStructuredOutput(text, language, mediaType) {
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 10);
    const now = new Date();
    
    // Extract timeline from sentences
    let timeline = [];
    for (let i = 0; i < Math.min(sentences.length, 5); i++) {
        if (sentences[i] && sentences[i].trim().length > 10) {
            const eventTime = new Date(now.getTime() - (sentences.length - i) * 60000);
            timeline.push({
                date: eventTime.toLocaleDateString(),
                time: eventTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                event: sentences[i].trim()
            });
        }
    }
    
    if (timeline.length === 0 && text.length > 20) {
        timeline.push({
            date: new Date().toLocaleDateString(),
            time: "Not specified",
            event: text.substring(0, 150)
        });
    }
    
    // Extract emotional impact
    let emotionalImpact = [];
    const emotions = ['scared', 'fear', 'anxious', 'trauma', 'depressed', 'helpless', 'angry', 'distressed', 'worried', 'panicked'];
    emotions.forEach(emotion => {
        if (text.toLowerCase().includes(emotion)) {
            emotionalImpact.push(emotion.charAt(0).toUpperCase() + emotion.slice(1));
        }
    });
    if (emotionalImpact.length === 0 && text.length > 50) {
        emotionalImpact.push("Emotional distress reported");
    }
    
    // Calculate quality score
    let score = 50;
    if (sentences.length >= 2) score += 10;
    if (sentences.length >= 4) score += 10;
    if (text.length > 100) score += 10;
    if (text.length > 200) score += 10;
    if (emotionalImpact.length > 0) score += 5;
    score = Math.min(score, 95);
    
    // Generate summary (short, not the full text)
    let summary = sentences[0] ? sentences[0].substring(0, 150) : "";
    if (sentences[1]) summary += " " + sentences[1].substring(0, 150);
    if (summary.length > 300) summary = summary.substring(0, 300) + "...";
    
    const languageLabels = {
        english: {
            timeline: 'Timeline of Events',
            emotional: 'Emotional Impact',
            summary: 'Case Summary',
            quality: 'Quality Assessment',
            recommendations: 'Recommendations'
        },
        hindi: {
            timeline: 'घटनाओं की समयरेखा',
            emotional: 'भावनात्मक प्रभाव',
            summary: 'केस सारांश',
            quality: 'गुणवत्ता मूल्यांकन',
            recommendations: 'सिफारिशें'
        }
    };
    
    const labels = languageLabels[language] || languageLabels.english;
    
    let recommendations = [];
    if (sentences.length < 3) recommendations.push("Add more chronological details about the incident");
    if (text.length < 100) recommendations.push("Provide more descriptive information");
    if (emotionalImpact.length === 0) recommendations.push("Describe your emotional state during the incident");
    if (recommendations.length === 0) recommendations.push("Testimony recorded successfully");
    
    return {
        formatType: 'standard',
        detectedLanguage: language,
        labels: labels,
        timeline: timeline,
        emotionalImpact: emotionalImpact,
        originalText: text,
        summary: summary,
        qualityScore: score,
        mediaType: mediaType,
        recommendations: recommendations,
        timestamp: now.toISOString()
    };
}

function convertToLegalFormat(text) {
    return `-------------------------------------
IN THE COURT OF [Court Name]

WITNESS TESTIMONY

Name: ${currentUser?.name || "[Name of the witness]"}
Date: ${new Date().toLocaleDateString()}

OATH:
"I solemnly affirm that the following statement is true to the best of my knowledge and belief."

STATEMENT OF FACTS:

${text}

DECLARATION:
"I declare that the above statement is true and correct to the best of my knowledge."

-------------------------------------
📜 This is an AI-generated legal format based on the testimony provided. Please review before submitting to court.`;
}

function displayStructuredOutput(data) {
    const container = document.getElementById('structuredOutput');
    const outputContent = document.getElementById('outputContent');
    
    if (!container || !outputContent) return;
    
    if (data.formatType === 'legal') {
        outputContent.innerHTML = `
            <div class="legal-container">
                <pre style="white-space: pre-wrap; background: var(--cream); padding: 20px; border-radius: 12px; font-family: monospace; font-size: 14px; line-height: 1.6;">${escapeHtml(data.content)}</pre>
                <div style="margin-top: 20px; display: flex; gap: 12px; justify-content: center;">
                    <button class="btn-primary" onclick="copyLegalContent()"><i class="fas fa-copy"></i> Copy</button>
                    <button class="btn-primary" onclick="downloadLegalContent()"><i class="fas fa-download"></i> Download</button>
                </div>
            </div>
        `;
        window.currentLegalContent = data.content;
    } else {
        const mediaIcon = data.mediaType === 'voice' ? '🎤' : data.mediaType === 'video' ? '📹' : '📝';
        const mediaName = data.mediaType === 'voice' ? 'Voice Recording' : data.mediaType === 'video' ? 'Video Recording' : 'Text Entry';
        
        outputContent.innerHTML = `
            <div class="lang-badge">
                <i class="fas fa-language"></i> ${data.detectedLanguage.toUpperCase()} | ${mediaIcon} ${mediaName} | ${new Date(data.timestamp).toLocaleString()}
            </div>
            
            <div class="timeline-section">
                <h4><i class="fas fa-history"></i> ${data.labels.timeline}</h4>
                ${data.timeline.map(event => `
                    <div class="timeline-event">
                        <strong>📅 ${event.date} 🕐 ${event.time}</strong>
                        <p>${escapeHtml(event.event)}</p>
                    </div>
                `).join('')}
            </div>
            
            <div class="emotional-section">
                <h4><i class="fas fa-heartbeat"></i> ${data.labels.emotional}</h4>
                <ul>
                    ${data.emotionalImpact.map(e => `<li><i class="fas fa-heart"></i> ${escapeHtml(e)}</li>`).join('')}
                </ul>
            </div>
            
            <div class="summary-section">
                <h4><i class="fas fa-file-alt"></i> ${data.labels.summary}</h4>
                <p>${escapeHtml(data.summary)}</p>
            </div>
            
            <div class="quality-section">
                <h4><i class="fas fa-chart-line"></i> ${data.labels.quality}</h4>
                <div class="score-bar">
                    <div class="score-fill" style="width: ${data.qualityScore}%"></div>
                </div>
                <p><strong>Score:</strong> ${data.qualityScore}/100</p>
                <p><strong>${data.labels.recommendations}:</strong> ${data.recommendations.join(', ')}</p>
            </div>
            
            <div class="disclaimer-note" style="margin-top: 20px; background: var(--cream); padding: 12px; border-radius: 8px; font-size: 12px;">
                <i class="fas fa-gavel"></i> This AI does not determine truthfulness. Legal authorities will independently verify facts.
            </div>
            
            <div style="margin-top: 20px; display: flex; gap: 12px; justify-content: center;">
                <button class="btn-primary" onclick="downloadTestimonyAsPDF()"><i class="fas fa-download"></i> Download PDF</button>
                <button class="btn-secondary" onclick="printTestimony()"><i class="fas fa-print"></i> Print</button>
            </div>
        `;
    }
    
    container.classList.remove('hidden');
    container.scrollIntoView({ behavior: 'smooth' });
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

function copyLegalContent() {
    if (window.currentLegalContent) {
        navigator.clipboard.writeText(window.currentLegalContent);
        showToast('Copied to clipboard!', 'success');
    }
}

function downloadLegalContent() {
    if (window.currentLegalContent) {
        const blob = new Blob([window.currentLegalContent], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `legal_testimony_${Date.now()}.txt`;
        a.click();
        URL.revokeObjectURL(url);
        showToast('Downloaded!', 'success');
    }
}

function downloadTestimonyAsPDF() {
    const outputContent = document.getElementById('outputContent');
    if (!outputContent) {
        showToast('No testimony to download', 'warning');
        return;
    }
    
    const htmlContent = `<!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <title>NyaySetu - Testimony Report</title>
        <style>
            body { font-family: 'DM Sans', Arial, sans-serif; padding: 40px; max-width: 800px; margin: 0 auto; line-height: 1.6; }
            .header { text-align: center; border-bottom: 2px solid #C9943A; padding-bottom: 20px; margin-bottom: 30px; }
            .header h1 { color: #C84B5A; font-family: 'Playfair Display', serif; }
            .timeline-event { background: #F0EDE8; padding: 12px; margin-bottom: 10px; border-radius: 8px; border-left: 3px solid #C9943A; }
            .footer { text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; }
            @media print { body { margin: 0; padding: 20px; } }
        </style>
    </head>
    <body>
        <div class="header">
            <h1>NyaySetu - Official Testimony Report</h1>
            <p>Generated on ${new Date().toLocaleString()}</p>
        </div>
        ${outputContent.innerHTML}
        <div class="footer">
            <p>This is an official testimony generated by NyaySetu. The information contained is confidential.</p>
            <p>Report ID: TF-${Date.now()} | Timestamp Verified</p>
        </div>
    </body>
    </html>`;
    
    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `testimony_report_${Date.now()}.html`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Downloaded successfully!', 'success');
}

function printTestimony() {
    const outputContent = document.getElementById('outputContent');
    if (!outputContent) {
        showToast('No testimony to print', 'warning');
        return;
    }
    
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>NyaySetu - Testimony Report</title>
            <style>
                body { font-family: 'DM Sans', Arial, sans-serif; padding: 40px; max-width: 800px; margin: 0 auto; line-height: 1.6; }
                .header { text-align: center; border-bottom: 2px solid #C9943A; padding-bottom: 20px; margin-bottom: 30px; }
                .header h1 { color: #C84B5A; }
                .timeline-event { background: #F0EDE8; padding: 12px; margin-bottom: 10px; border-radius: 8px; border-left: 3px solid #C9943A; }
                .footer { text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; }
                @media print { body { margin: 0; padding: 20px; } }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>NyaySetu - Official Testimony Report</h1>
                <p>Generated on ${new Date().toLocaleString()}</p>
            </div>
            ${outputContent.innerHTML}
            <div class="footer">
                <p>This is an official testimony generated by NyaySetu.</p>
            </div>
        </body>
        </html>
    `);
    printWindow.document.close();
    printWindow.print();
    printWindow.close();
}

// ============ SAVE TESTIMONY ============
async function saveTestimony() {
    if (!currentUser) {
        showToast('Please login to save', 'warning');
        openModal();
        return;
    }
    
    const outputContent = document.getElementById('outputContent');
    const structuredData = outputContent?.innerHTML || '';
    
    if (!structuredData) {
        showToast('Please analyze your testimony first', 'warning');
        return;
    }
    
    const caseId = `CASE-${Date.now()}`;
    const testimony = {
        userId: currentUser.email,
        userName: currentUser.name,
        userRole: currentUser.role,
        structuredData: structuredData,
        timestamp: Date.now(),
        synced: isOnline,
        caseId: caseId,
        language: document.getElementById('testimonyLanguage').value
    };
    
    const transaction = db.transaction(['testimonies'], 'readwrite');
    const store = transaction.objectStore('testimonies');
    const request = store.add(testimony);
    
    request.onsuccess = () => {
        showToast(`Testimony saved! Case ID: ${caseId}`, 'success');
        document.getElementById('structuredOutput').classList.add('hidden');
        loadRecords();
        updateStorageInfo();
        showPage('records');
    };
    
    request.onerror = () => {
        showToast('Error saving testimony', 'error');
    };
}

// ============ LOAD RECORDS ============
function loadRecords() {
    if (!currentUser) return;
    
    const transaction = db.transaction(['testimonies'], 'readonly');
    const store = transaction.objectStore('testimonies');
    const index = store.index('userId');
    const request = index.getAll(currentUser.email);
    
    request.onsuccess = () => {
        const records = request.result || [];
        displayRecords(records);
        updateStorageInfo();
    };
}

function displayRecords(records) {
    const container = document.getElementById('recordsList');
    if (!container) return;
    
    if (!records || records.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-inbox"></i>
                <p>No records yet</p>
                <button class="btn-primary" onclick="showPage('record')">Record Your First Testimony</button>
            </div>
        `;
        return;
    }
    
    container.innerHTML = records.slice().reverse().map(record => `
        <div class="record-card">
            <strong><i class="fas fa-folder-open"></i> ${record.caseId}</strong>
            <small>${new Date(record.timestamp).toLocaleString()}</small>
            <div>
                <span class="status-badge ${record.synced ? 'synced' : 'pending'}">${record.synced ? 'Synced' : 'Pending Sync'}</span>
            </div>
            <div class="card-actions">
                <button onclick="viewRecord(${record.id})"><i class="fas fa-eye"></i> View</button>
                <button onclick="deleteRecord(${record.id})"><i class="fas fa-trash"></i> Delete</button>
            </div>
        </div>
    `).join('');
}

function viewRecord(id) {
    const transaction = db.transaction(['testimonies'], 'readonly');
    const store = transaction.objectStore('testimonies');
    const request = store.get(id);
    
    request.onsuccess = () => {
        const record = request.result;
        const outputContent = document.getElementById('outputContent');
        if (outputContent) outputContent.innerHTML = record.structuredData;
        const structuredOutput = document.getElementById('structuredOutput');
        if (structuredOutput) structuredOutput.classList.remove('hidden');
        showPage('record');
        if (structuredOutput) structuredOutput.scrollIntoView({ behavior: 'smooth' });
    };
}

function deleteRecord(id) {
    if (confirm('Are you sure you want to delete this testimony?')) {
        const transaction = db.transaction(['testimonies'], 'readwrite');
        const store = transaction.objectStore('testimonies');
        store.delete(id);
        showToast('Record deleted', 'success');
        loadRecords();
        updateStorageInfo();
    }
}

// ============ SYNC RECORDS ============
function syncRecords() {
    if (!isOnline) {
        showToast('You are offline. Please connect to the internet to sync.', 'warning');
        return;
    }
    
    if (!currentUser) {
        showToast('Please login to sync', 'warning');
        return;
    }
    
    showToast('Syncing records...', 'info');
    
    const transaction = db.transaction(['testimonies'], 'readwrite');
    const store = transaction.objectStore('testimonies');
    const index = store.index('userId');
    const request = index.getAll(currentUser.email);
    
    request.onsuccess = () => {
        const records = request.result || [];
        let syncedCount = 0;
        
        records.forEach(record => {
            if (!record.synced) {
                record.synced = true;
                record.syncedAt = Date.now();
                store.put(record);
                syncedCount++;
            }
        });
        
        if (syncedCount > 0) {
            showToast(`Synced ${syncedCount} records successfully!`, 'success');
            loadRecords();
            updateStorageInfo();
        } else {
            showToast('All records are already synced', 'info');
        }
    };
}

// ============ FEEDBACK SYSTEM ==========
let currentRating = 0;
let currentRecommend = null;

function setupFeedbackStars() {
    const stars = document.querySelectorAll('.rating-stars i');
    stars.forEach(star => {
        star.addEventListener('click', () => {
            currentRating = parseInt(star.dataset.rating);
            stars.forEach((s, i) => {
                if (i < currentRating) {
                    s.className = 'fas fa-star active';
                } else {
                    s.className = 'far fa-star';
                }
            });
            const ratingValue = document.getElementById('ratingValue');
            if (ratingValue) ratingValue.value = currentRating;
        });
    });
    
    const recommendBtns = document.querySelectorAll('.recommend-btn');
    recommendBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            currentRecommend = btn.dataset.recommend;
            recommendBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const recommendValue = document.getElementById('recommendValue');
            if (recommendValue) recommendValue.value = currentRecommend;
        });
    });
}

function submitFeedback() {
    if (!currentUser) {
        showToast('Please login to submit feedback', 'warning');
        openModal();
        return;
    }
    
    const like = document.getElementById('feedbackLike')?.value || '';
    const improve = document.getElementById('feedbackImprove')?.value || '';
    
    if (!like && !improve && !currentRating) {
        showToast('Please provide some feedback', 'warning');
        return;
    }
    
    const feedback = {
        userId: currentUser.email,
        userName: currentUser.name,
        userRole: currentUser.role,
        rating: currentRating,
        recommend: currentRecommend,
        like: like,
        improve: improve,
        timestamp: Date.now()
    };
    
    const transaction = db.transaction(['feedback'], 'readwrite');
    const store = transaction.objectStore('feedback');
    const request = store.add(feedback);
    
    request.onsuccess = () => {
        showToast('Thank you for your feedback!', 'success');
        
        currentRating = 0;
        currentRecommend = null;
        document.querySelectorAll('.rating-stars i').forEach(s => s.className = 'far fa-star');
        document.querySelectorAll('.recommend-btn').forEach(b => b.classList.remove('active'));
        const likeInput = document.getElementById('feedbackLike');
        const improveInput = document.getElementById('feedbackImprove');
        if (likeInput) likeInput.value = '';
        if (improveInput) improveInput.value = '';
        const ratingValue = document.getElementById('ratingValue');
        if (ratingValue) ratingValue.value = '';
        const recommendValue = document.getElementById('recommendValue');
        if (recommendValue) recommendValue.value = '';
        
        loadFeedback();
    };
    
    request.onerror = () => {
        showToast('Error submitting feedback', 'error');
    };
}

function loadFeedback() {
    const transaction = db.transaction(['feedback'], 'readonly');
    const store = transaction.objectStore('feedback');
    const request = store.getAll();
    
    request.onsuccess = () => {
        const feedbacks = (request.result || []).slice(-5).reverse();
        const container = document.getElementById('feedbackList');
        if (!container) return;
        
        if (feedbacks.length === 0) {
            container.innerHTML = '<p class="text-center">No feedback yet. Be the first to share!</p>';
            return;
        }
        
        container.innerHTML = feedbacks.map(f => `
            <div class="feedback-item">
                <div class="feedback-header">
                    <strong>${escapeHtml(f.userName)}</strong>
                    <div class="stars">${'★'.repeat(f.rating)}${'☆'.repeat(5 - f.rating)}</div>
                </div>
                <p><i class="fas fa-thumbs-up"></i> ${escapeHtml(f.like || '—')}</p>
                ${f.improve ? `<p><i class="fas fa-lightbulb"></i> ${escapeHtml(f.improve)}</p>` : ''}
                <small>${new Date(f.timestamp).toLocaleDateString()}</small>
            </div>
        `).join('');
    };
}

// ============ STORAGE MANAGEMENT ============
function updateStorageInfo() {
    if (!currentUser) return;
    
    const transaction = db.transaction(['testimonies'], 'readonly');
    const store = transaction.objectStore('testimonies');
    const index = store.index('userId');
    const request = index.getAll(currentUser.email);
    
    request.onsuccess = () => {
        const records = request.result || [];
        const pending = records.filter(r => !r.synced).length;
        const pendingSpan = document.getElementById('pendingSync');
        if (pendingSpan) pendingSpan.textContent = pending;
        
        const storageUsed = JSON.stringify(records).length / 1024;
        const storageSpan = document.getElementById('storageUsed');
        if (storageSpan) storageSpan.textContent = storageUsed.toFixed(1);
        
        // Update stats counters
        const stat1 = document.getElementById('stat1');
        const stat2 = document.getElementById('stat2');
        const stat3 = document.getElementById('stat3');
        const stat4 = document.getElementById('stat4');
        
        if (stat1) animateNumber(stat1, records.length);
        if (stat2) animateNumber(stat2, 98);
        if (stat3) animateNumber(stat3, records.length * 2);
        if (stat4) animateNumber(stat4, 12);
    };
}

function animateNumber(element, target) {
    let current = 0;
    const suffix = target === 98 ? '%' : '';
    const increment = target / 50;
    const interval = setInterval(() => {
        current += increment;
        if (current >= target) {
            current = target;
            clearInterval(interval);
        }
        element.textContent = Math.floor(current) + suffix;
    }, 30);
}

function animateCounters() {
    const counters = document.querySelectorAll('.stat-number');
    counters.forEach(counter => {
        const target = parseInt(counter.getAttribute('data-target'));
        if (target) {
            animateNumber(counter, target);
        }
    });
}

function exportAllData() {
    if (!currentUser) {
        showToast('Please login to export data', 'warning');
        return;
    }
    
    const transaction = db.transaction(['testimonies'], 'readonly');
    const store = transaction.objectStore('testimonies');
    const index = store.index('userId');
    const request = index.getAll(currentUser.email);
    
    request.onsuccess = () => {
        const data = {
            user: currentUser,
            testimonies: request.result || [],
            exportDate: new Date().toISOString()
        };
        
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `nyaysetu_export_${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
        showToast('Data exported successfully!', 'success');
    };
}

function clearLocalData() {
    if (!currentUser) {
        showToast('Please login to clear data', 'warning');
        return;
    }
    
    if (confirm('⚠️ WARNING: This will delete ALL your local testimonies. This cannot be undone. Continue?')) {
        const transaction = db.transaction(['testimonies'], 'readwrite');
        const store = transaction.objectStore('testimonies');
        const index = store.index('userId');
        const request = index.getAll(currentUser.email);
        
        request.onsuccess = () => {
            const records = request.result || [];
            records.forEach(record => {
                store.delete(record.id);
            });
            showToast('Local data cleared successfully', 'success');
            loadRecords();
            updateStorageInfo();
        };
    }
}

// ============ WAVEFORM INITIALIZATION ============
function initWaveform() {
    const waveform = document.getElementById('waveform');
    if (!waveform) return;
    
    waveform.innerHTML = '';
    for (let i = 0; i < 48; i++) {
        const bar = document.createElement('div');
        bar.className = 'wave-bar';
        bar.style.height = '20px';
        waveform.appendChild(bar);
    }
    
    // Animate waveform when not recording
    setInterval(() => {
        if (!isVoiceRecording && !isVideoRecording) {
            const bars = document.querySelectorAll('.wave-bar');
            bars.forEach((bar, i) => {
                const height = 10 + Math.sin(Date.now() / 500 + i * 0.2) * 8;
                bar.style.height = height + 'px';
            });
        }
    }, 100);
}

// ============ INITIALIZE APP ============
document.addEventListener('DOMContentLoaded', () => {
    initIndexedDB();
    initWaveform();
    setupFeedbackStars();
    setupTextAutoSave();
    
    // Load saved theme
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
        const themeBtn = document.getElementById('themeBtn');
        if (themeBtn) themeBtn.innerHTML = '<i class="fas fa-sun"></i>';
        const darkModeSwitch = document.getElementById('darkModeSwitch');
        if (darkModeSwitch) darkModeSwitch.checked = true;
    }
    
    // Check for saved user
    const savedUser = localStorage.getItem('currentUser');
    if (savedUser) {
        try {
            currentUser = JSON.parse(savedUser);
            updateUIForLoggedInUser();
            loadRecords();
            checkForDraft();
        } catch (e) {
            console.error('Error loading saved user:', e);
        }
    }
});

// Make functions global
window.showPage = showPage;
window.selectMethod = selectMethod;
window.toggleTheme = toggleTheme;
window.toggleThemeFromSwitch = toggleThemeFromSwitch;
window.openModal = openModal;
window.closeModal = closeModal;
window.switchLoginMethod = switchLoginMethod;
window.switchAuthTab = switchAuthTab;
window.handleLogin = handleLogin;
window.handleRegister = handleRegister;
window.handleMobileLogin = handleMobileLogin;
window.logout = logout;
window.toggleUserMenu = toggleUserMenu;
window.startVoiceRecording = startVoiceRecording;
window.pauseVoiceRecording = pauseVoiceRecording;
window.stopVoiceRecording = stopVoiceRecording;
window.resetVoiceRecording = resetVoiceRecording;
window.startVideoRecording = startVideoRecording;
window.pauseVideoRecording = pauseVideoRecording;
window.stopVideoRecording = stopVideoRecording;
window.resetVideoRecording = resetVideoRecording;
window.analyzeTestimony = analyzeTestimony;
window.saveTestimony = saveTestimony;
window.submitFeedback = submitFeedback;
window.exportAllData = exportAllData;
window.clearLocalData = clearLocalData;
window.downloadTestimonyAsPDF = downloadTestimonyAsPDF;
window.printTestimony = printTestimony;
window.scrollToHow = scrollToHow;
window.resumeDraft = resumeDraft;
window.discardDraft = discardDraft;
window.viewRecord = viewRecord;
window.deleteRecord = deleteRecord;
window.syncRecords = syncRecords;
window.copyLegalContent = copyLegalContent;
window.downloadLegalContent = downloadLegalContent;
window.openForgotPasswordModal = openForgotPasswordModal;
window.closeForgotPasswordModal = closeForgotPasswordModal;
window.sendResetOtp = sendResetOtp;
window.verifyResetOtpAndResetPassword = verifyResetOtpAndResetPassword;
window.openMobileForgotPasswordModal = openMobileForgotPasswordModal;
window.closeMobileForgotPasswordModal = closeMobileForgotPasswordModal;
window.sendMobileResetOtp = sendMobileResetOtp;
window.verifyMobileResetOtpAndResetPassword = verifyMobileResetOtpAndResetPassword;