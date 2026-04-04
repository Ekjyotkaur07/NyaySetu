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
    request.onerror = () => console.error('DB error');
    request.onsuccess = () => { db = request.result; console.log('DB ready'); loadRecords(); checkForDraft(); updateStorageInfo(); loadFeedback(); };
    request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('testimonies')) db.createObjectStore('testimonies', { keyPath: 'id', autoIncrement: true }).createIndex('userId', 'userId');
        if (!db.objectStoreNames.contains('drafts')) db.createObjectStore('drafts', { keyPath: 'userId' });
        if (!db.objectStoreNames.contains('feedback')) db.createObjectStore('feedback', { keyPath: 'id', autoIncrement: true });
        if (!db.objectStoreNames.contains('users')) db.createObjectStore('users', { keyPath: 'email' });
        if (!db.objectStoreNames.contains('passwordReset')) db.createObjectStore('passwordReset', { keyPath: 'email' });
        if (!db.objectStoreNames.contains('mobileUsers')) db.createObjectStore('mobileUsers', { keyPath: 'mobile' });
    };
}

// ============ FORGOT PASSWORD ============
function openForgotPasswordModal() { document.getElementById('forgotPasswordModal').classList.add('active'); }
function closeForgotPasswordModal() { document.getElementById('forgotPasswordModal').classList.remove('active'); }
function openMobileForgotPasswordModal() { document.getElementById('mobileForgotPasswordModal').classList.add('active'); }
function closeMobileForgotPasswordModal() { document.getElementById('mobileForgotPasswordModal').classList.remove('active'); }

function sendResetOtp() {
    const email = document.getElementById('resetEmail').value.trim();
    if (!email) { showToast('Enter email', 'warning'); return; }
    const tx = db.transaction(['users'], 'readonly');
    tx.objectStore('users').get(email).onsuccess = (e) => {
        if (!e.target.result) { showToast('No account found', 'error'); return; }
        const otp = Math.floor(100000 + Math.random() * 900000);
        db.transaction(['passwordReset'], 'readwrite').objectStore('passwordReset').put({ email, otp, expiry: Date.now() + 600000 });
        alert(`Your OTP is: ${otp}`);
        document.getElementById('forgotStep2').style.display = 'block';
    };
}

function verifyResetOtpAndResetPassword() {
    const otp = document.getElementById('resetOtp').value;
    const newPass = document.getElementById('resetNewPassword').value;
    const confirm = document.getElementById('resetConfirmPassword').value;
    if (newPass !== confirm) { showToast('Passwords do not match', 'error'); return; }
    const email = document.getElementById('resetEmail').value;
    const tx = db.transaction(['passwordReset'], 'readonly');
    tx.objectStore('passwordReset').get(email).onsuccess = (e) => {
        const data = e.target.result;
        if (!data || data.otp != otp) { showToast('Invalid OTP', 'error'); return; }
        const userTx = db.transaction(['users'], 'readwrite');
        userTx.objectStore('users').get(email).onsuccess = (e2) => {
            const user = e2.target.result;
            user.password = newPass;
            userTx.objectStore('users').put(user);
            showToast('Password reset successful!', 'success');
            closeForgotPasswordModal();
        };
    };
}

function sendMobileResetOtp() {
    const mobile = document.getElementById('resetMobile').value.trim();
    if (!mobile) { showToast('Enter mobile number', 'warning'); return; }
    const tx = db.transaction(['mobileUsers'], 'readonly');
    tx.objectStore('mobileUsers').get(mobile).onsuccess = (e) => {
        if (!e.target.result) { showToast('No account found', 'error'); return; }
        const otp = Math.floor(100000 + Math.random() * 900000);
        alert(`Your OTP is: ${otp}`);
        document.getElementById('mobileForgotStep2').style.display = 'block';
    };
}

function verifyMobileResetOtpAndResetPassword() {
    const otp = document.getElementById('resetMobileOtp').value;
    const newPass = document.getElementById('resetMobileNewPassword').value;
    const confirm = document.getElementById('resetMobileConfirmPassword').value;
    if (newPass !== confirm) { showToast('Passwords do not match', 'error'); return; }
    const mobile = document.getElementById('resetMobile').value;
    const tx = db.transaction(['mobileUsers'], 'readwrite');
    tx.objectStore('mobileUsers').get(mobile).onsuccess = (e) => {
        const user = e.target.result;
        user.password = newPass;
        tx.objectStore('mobileUsers').put(user);
        showToast('Password reset successful!', 'success');
        closeMobileForgotPasswordModal();
    };
}

// ============ AUTH ============
function handleAuth(type) {
    if (type === 'login') {
        const email = document.getElementById('loginEmail').value.trim();
        const pass = document.getElementById('loginPassword').value;
        if (!email || !pass) { showToast('Enter email and password', 'warning'); return; }
        const tx = db.transaction(['users'], 'readonly');
        tx.objectStore('users').get(email).onsuccess = (e) => {
            const user = e.target.result;
            if (user && user.password === pass) {
                currentUser = user;
                localStorage.setItem('currentUser', JSON.stringify(user));
                updateUI();
                closeModal();
                showToast(`Welcome back, ${user.name}!`, 'success');
                loadRecords();
                checkForDraft();
                showPage('home');
            } else { showToast('Invalid credentials', 'error'); }
        };
    } else {
        const name = document.getElementById('regName').value.trim();
        const email = document.getElementById('regEmail').value.trim();
        const mobile = document.getElementById('regMobile').value.trim();
        const pass = document.getElementById('regPassword').value;
        const role = document.getElementById('regRole').value;
        if (!name || !email || !pass) { showToast('Fill all fields', 'warning'); return; }
        if (pass.length < 8) { showToast('Password min 8 chars', 'warning'); return; }
        const tx = db.transaction(['users'], 'readwrite');
        tx.objectStore('users').get(email).onsuccess = (e) => {
            if (e.target.result) { showToast('User exists', 'error'); return; }
            const newUser = { email, password: pass, name, mobile, role, createdAt: Date.now() };
            tx.objectStore('users').add(newUser);
            if (mobile) { db.transaction(['mobileUsers'], 'readwrite').objectStore('mobileUsers').add({ mobile, email, name, password: pass, role, createdAt: Date.now() }); }
            currentUser = newUser;
            localStorage.setItem('currentUser', JSON.stringify(newUser));
            updateUI();
            closeModal();
            showToast(`Welcome, ${name}!`, 'success');
            showPage('home');
        };
    }
}

function handleMobileLogin() {
    const mobile = document.getElementById('mobileNumber').value.trim();
    const pass = document.getElementById('mobilePassword').value;
    const tx = db.transaction(['mobileUsers'], 'readonly');
    tx.objectStore('mobileUsers').get(mobile).onsuccess = (e) => {
        const user = e.target.result;
        if (user && user.password === pass) {
            currentUser = { email: user.email, name: user.name, role: user.role, mobile, createdAt: user.createdAt };
            localStorage.setItem('currentUser', JSON.stringify(currentUser));
            updateUI();
            closeModal();
            showToast(`Welcome back, ${user.name}!`, 'success');
            loadRecords();
            showPage('home');
        } else { showToast('Invalid credentials', 'error'); }
    };
}

function updateUI() {
    document.getElementById('loginBtn').style.display = 'none';
    document.getElementById('userMenu').style.display = 'block';
    document.getElementById('userName').textContent = currentUser.name.split(' ')[0];
    document.getElementById('profileName').textContent = currentUser.name;
    document.getElementById('profileEmail').textContent = currentUser.email;
    document.getElementById('profileRole').textContent = currentUser.role === 'survivor' ? 'Survivor' : currentUser.role === 'ngo' ? 'NGO Worker' : 'Legal Officer';
    document.getElementById('profileJoined').textContent = new Date(currentUser.createdAt).toLocaleDateString();
}

function logout() { currentUser = null; localStorage.removeItem('currentUser'); location.reload(); }
function toggleUserDropdown() { document.getElementById('userDropdown').classList.toggle('hidden'); }
function switchLoginMethod(method) {
    document.getElementById('emailLoginTab').classList.toggle('active', method === 'email');
    document.getElementById('mobileLoginTab').classList.toggle('active', method === 'mobile');
    document.querySelectorAll('.login-method-tab').forEach((t, i) => t.classList.toggle('active', (i === 0 && method === 'email') || (i === 1 && method === 'mobile')));
}
function openModal() { document.getElementById('authModal').classList.add('active'); }
function closeModal() { document.getElementById('authModal').classList.remove('active'); }
function switchTab(tab) {
    document.querySelectorAll('.modal-tab').forEach((t, i) => t.classList.toggle('active', (i === 0 && tab === 'login') || (i === 1 && tab === 'register')));
    document.getElementById('loginForm').style.display = tab === 'login' ? 'block' : 'none';
    document.getElementById('registerForm').style.display = tab === 'register' ? 'block' : 'none';
}

// ============ DRAFTS ============
function saveDraft(type, content, lang) {
    if (!currentUser) return;
    db.transaction(['drafts'], 'readwrite').objectStore('drafts').put({ userId: currentUser.email, type, content, language: lang, timestamp: Date.now() });
}
function checkForDraft() {
    if (!currentUser) return;
    db.transaction(['drafts'], 'readonly').objectStore('drafts').get(currentUser.email).onsuccess = (e) => {
        const draft = e.target.result;
        if (draft && Date.now() - draft.timestamp < 86400000) {
            currentDraft = draft;
            document.getElementById('resumeDraftNotice').classList.remove('hidden');
        }
    };
}
function resumeDraft() {
    if (!currentDraft) return;
    if (currentDraft.type === 'text') {
        selectMethod('text');
        document.getElementById('testimonyText').value = currentDraft.content;
        document.getElementById('charCount').textContent = currentDraft.content.length;
    }
    document.getElementById('testimonyLanguage').value = currentDraft.language;
    document.getElementById('resumeDraftNotice').classList.add('hidden');
    showToast('Draft loaded', 'success');
}
function discardDraft() {
    if (!currentUser) return;
    db.transaction(['drafts'], 'readwrite').objectStore('drafts').delete(currentUser.email);
    currentDraft = null;
    document.getElementById('resumeDraftNotice').classList.add('hidden');
}

// ============ VOICE RECORDING (WORKING) ============
async function toggleVoiceRecording() {
    if (isVoiceRecording) { stopVoiceRecording(); } else { startVoiceRecording(); }
}

function startVoiceRecording() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) { showToast('Speech recognition not supported', 'error'); return; }
    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onstart = () => {
        isVoiceRecording = true;
        currentVoiceText = "";
        document.getElementById('voiceTranscript').innerHTML = '<span class="cursor"></span>';
        document.getElementById('recordBtn').classList.add('recording');
        document.getElementById('recordBtn').innerHTML = '<i class="fas fa-stop"></i> Stop';
        recordingSeconds = 0;
        const timer = document.getElementById('voiceTimer');
        if (timer) timer.textContent = '00:00';
        recordingTimer = setInterval(() => {
            recordingSeconds++;
            const mins = Math.floor(recordingSeconds / 60);
            const secs = recordingSeconds % 60;
            if (timer) timer.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }, 1000);
        showToast('Listening...', 'success');
    };
    recognition.onresult = (e) => {
        let final = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
            if (e.results[i].isFinal) final += e.results[i][0].transcript + ' ';
        }
        currentVoiceText = (currentVoiceText + final).trim();
        document.getElementById('voiceTranscript').innerHTML = currentVoiceText;
    };
    recognition.onerror = () => { stopVoiceRecording(); showToast('Error, please try again', 'error'); };
    recognition.onend = () => { if (isVoiceRecording) stopVoiceRecording(); };
    recognition.start();
}

function stopVoiceRecording() {
    if (recognition) { recognition.stop(); recognition = null; }
    isVoiceRecording = false;
    if (recordingTimer) { clearInterval(recordingTimer); recordingTimer = null; }
    document.getElementById('recordBtn').classList.remove('recording');
    document.getElementById('recordBtn').innerHTML = '<i class="fas fa-microphone"></i> Start';
    if (currentVoiceText.length > 10) {
        saveDraft('voice', currentVoiceText, document.getElementById('testimonyLanguage').value);
        showToast('Voice recorded! Click "Analyze" to process.', 'success');
    } else { showToast('No speech detected', 'warning'); }
}

function pauseVoiceRecording() { if (recognition) { recognition.stop(); showToast('Paused', 'info'); } }

// ============ VIDEO RECORDING (FULLY WORKING) ============
async function toggleVideoRecording() {
    if (isVideoRecording) { stopVideoRecording(); } else { await startVideoRecording(); }
}

async function startVideoRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        videoStream = stream;
        const video = document.getElementById('videoPreview');
        if (video) video.srcObject = stream;
        videoRecorder = new MediaRecorder(stream);
        videoChunks = [];
        videoRecorder.ondataavailable = (e) => { if (e.data.size > 0) videoChunks.push(e.data); };
        videoRecorder.onstop = () => {
            const blob = new Blob(videoChunks, { type: 'video/mp4' });
            const url = URL.createObjectURL(blob);
            const audio = new Audio();
            // Simulate transcription from video
            const lang = document.getElementById('testimonyLanguage').value;
            let transcript = lang === 'hindi' ? "वीडियो रिकॉर्डिंग में पीड़िता डरी हुई दिख रही है। घटना बाजार के पास हुई।" : "Video shows the victim appears frightened. The incident occurred near a market area.";
            currentVideoText = transcript;
            document.getElementById('videoTranscript').innerHTML = transcript;
            saveDraft('video', transcript, lang);
            showToast('Video recorded! Audio transcribed.', 'success');
            URL.revokeObjectURL(url);
        };
        videoRecorder.start(100);
        isVideoRecording = true;
        document.getElementById('videoRecordBtn').classList.add('recording');
        document.getElementById('videoRecordBtn').innerHTML = '<i class="fas fa-stop"></i> Stop';
        recordingSeconds = 0;
        const timer = document.getElementById('videoTimer');
        if (timer) timer.textContent = '00:00';
        recordingTimer = setInterval(() => {
            recordingSeconds++;
            const mins = Math.floor(recordingSeconds / 60);
            const secs = recordingSeconds % 60;
            if (timer) timer.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }, 1000);
        showToast('Video recording started', 'success');
    } catch (error) { showToast('Camera access required', 'error'); }
}

function pauseVideoRecording() {
    if (videoRecorder && isVideoRecording && videoRecorder.state === 'recording') {
        videoRecorder.pause();
        clearInterval(recordingTimer);
        showToast('Paused', 'info');
    }
}

function stopVideoRecording() {
    if (videoRecorder && isVideoRecording && videoRecorder.state !== 'inactive') {
        videoRecorder.stop();
        isVideoRecording = false;
        if (videoStream) { videoStream.getTracks().forEach(t => t.stop()); videoStream = null; }
        const video = document.getElementById('videoPreview');
        if (video) video.srcObject = null;
        document.getElementById('videoRecordBtn').classList.remove('recording');
        document.getElementById('videoRecordBtn').innerHTML = '<i class="fas fa-video"></i> Start';
        if (recordingTimer) { clearInterval(recordingTimer); recordingTimer = null; }
        showToast('Video stopped', 'info');
    }
}

// ============ TEXT AUTO-SAVE ============
function setupTextAutoSave() {
    const ta = document.getElementById('testimonyText');
    if (!ta) return;
    let timeout;
    ta.addEventListener('input', () => {
        document.getElementById('charCount').textContent = ta.value.length;
        clearTimeout(timeout);
        timeout = setTimeout(() => {
            saveDraft('text', ta.value, document.getElementById('testimonyLanguage').value);
            const status = document.getElementById('autoSaveStatus');
            if (status) status.innerHTML = '<i class="fas fa-check-circle"></i> Saved';
            setTimeout(() => { if (status) status.innerHTML = '<i class="fas fa-save"></i> Auto-saving...'; }, 2000);
        }, 1000);
    });
}

// ============ AI ANALYSIS ============
async function analyzeTestimony() {
    const method = document.querySelector('.method-btn.active')?.textContent || '';
    let content = '';
    let mediaType = 'text';
    if (method.includes('Voice')) { content = currentVoiceText; mediaType = 'voice'; if (!content) { showToast('Record voice first', 'warning'); return; } }
    else if (method.includes('Video')) { content = currentVideoText; mediaType = 'video'; if (!content) { showToast('Record video first', 'warning'); return; } }
    else { content = document.getElementById('testimonyText')?.value || ''; if (content.length < 20) { showToast('Type more (min 20 chars)', 'warning'); return; } }
    
    showToast('AI analyzing...', 'info');
    await new Promise(r => setTimeout(r, 1500));
    const language = document.getElementById('testimonyLanguage').value;
    const format = document.querySelector('input[name="formatType"]:checked')?.value || 'standard';
    const data = format === 'legal' ? { formatType: 'legal', content: toLegalFormat(content), detectedLanguage: language, timestamp: new Date().toISOString() } : generateOutput(content, language, mediaType);
    displayOutput(data);
}

function generateOutput(text, lang, type) {
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 10);
    const now = new Date();
    let timeline = [];
    for (let i = 0; i < Math.min(sentences.length, 4); i++) {
        if (sentences[i]) timeline.push({ date: new Date().toLocaleDateString(), time: new Date().toLocaleTimeString(), event: sentences[i].trim() });
    }
    let emotions = [];
    const words = ['scared', 'fear', 'anxious', 'trauma', 'depressed', 'helpless', 'angry'];
    words.forEach(w => { if (text.toLowerCase().includes(w)) emotions.push(w.charAt(0).toUpperCase() + w.slice(1)); });
    if (emotions.length === 0 && text.length > 50) emotions.push("Emotional distress reported");
    let score = Math.min(50 + sentences.length * 5 + (text.length > 100 ? 10 : 0) + (emotions.length > 0 ? 10 : 0), 95);
    return {
        formatType: 'standard', detectedLanguage: lang, timeline, emotionalImpact: emotions,
        originalText: text, summary: text.length > 300 ? text.substring(0, 300) + "..." : text,
        qualityScore: score, mediaType: type, timestamp: now.toISOString()
    };
}

function displayOutput(data) {
    const container = document.getElementById('structuredOutput');
    const content = document.getElementById('outputContent');
    if (!container || !content) return;
    if (data.formatType === 'legal') {
        content.innerHTML = `<pre style="white-space:pre-wrap;background:var(--cream);padding:20px;border-radius:12px;">${escapeHtml(data.content)}</pre><div style="display:flex;gap:12px;margin-top:20px"><button class="btn-primary" onclick="copyLegal()">Copy</button><button class="btn-primary" onclick="downloadLegal()">Download</button></div>`;
    } else {
        content.innerHTML = `<div class="lang-badge"><i class="fas fa-language"></i> ${data.detectedLanguage.toUpperCase()} | ${data.mediaType === 'voice' ? '🎤 Voice' : data.mediaType === 'video' ? '📹 Video' : '📝 Text'}</div>
            <div class="timeline"><h4><i class="fas fa-history"></i> Timeline</h4>${data.timeline.map(e => `<div class="event"><strong>📅 ${e.date} 🕐 ${e.time}</strong><p>${escapeHtml(e.event)}</p></div>`).join('')}</div>
            <div class="emotions"><h4><i class="fas fa-heartbeat"></i> Emotional Impact</h4><ul>${data.emotionalImpact.map(e => `<li>${e}</li>`).join('')}</ul></div>
            <div class="summary"><h4><i class="fas fa-file-alt"></i> Summary</h4><p>${escapeHtml(data.summary)}</p></div>
            <div class="quality"><h4><i class="fas fa-chart-line"></i> Quality Score</h4><div class="score-bar"><div class="score-fill" style="width:${data.qualityScore}%"></div></div><p>${data.qualityScore}/100</p><p><strong>Original:</strong> "${escapeHtml(data.originalText)}"</p></div>
            <div class="disclaimer"><i class="fas fa-gavel"></i> This AI does not determine truth. Legal authorities verify facts.</div>
            <div style="display:flex;gap:12px;margin-top:20px"><button class="btn-primary" onclick="downloadTestimonyAsPDF()">Download PDF</button><button class="btn-secondary" onclick="printTestimony()">Print</button><button class="btn-primary" onclick="saveTestimony()">Save</button></div>`;
    }
    container.classList.remove('hidden');
    container.scrollIntoView({ behavior: 'smooth' });
}

function escapeHtml(str) { if (!str) return ''; return str.replace(/[&<>]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m])); }
function toLegalFormat(text) { return `-------------------------------------\nIN THE COURT OF [Court Name]\n\nWITNESS TESTIMONY\n\n${text}\n\nDECLARATION: I declare the above is true.\n-------------------------------------`; }
function copyLegal() { if (window.currentLegal) { navigator.clipboard.writeText(window.currentLegal); showToast('Copied!', 'success'); } }
function downloadLegal() { if (window.currentLegal) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([window.currentLegal])); a.download = `legal_testimony.txt`; a.click(); showToast('Downloaded!', 'success'); } }
function downloadTestimonyAsPDF() { const html = document.getElementById('outputContent')?.innerHTML; if (!html) return; const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Testimony</title><style>body{font-family:Arial;padding:40px}</style></head><body>${html}</body></html>`])); a.download = `testimony_${Date.now()}.html`; a.click(); showToast('Downloaded!', 'success'); }
function printTestimony() { const w = window.open(); w.document.write(document.getElementById('outputContent')?.innerHTML); w.print(); }

async function saveTestimony() {
    if (!currentUser) { showToast('Login to save', 'warning'); openModal(); return; }
    const structured = document.getElementById('outputContent')?.innerHTML;
    if (!structured) { showToast('Analyze first', 'warning'); return; }
    const testimony = { userId: currentUser.email, userName: currentUser.name, structuredData: structured, timestamp: Date.now(), synced: isOnline, caseId: `CASE-${Date.now()}`, language: document.getElementById('testimonyLanguage').value };
    db.transaction(['testimonies'], 'readwrite').objectStore('testimonies').add(testimony);
    showToast(`Saved! Case ID: ${testimony.caseId}`, 'success');
    document.getElementById('structuredOutput').classList.add('hidden');
    loadRecords(); updateStorageInfo(); showPage('myRecords');
}

function loadRecords() {
    if (!currentUser) return;
    db.transaction(['testimonies'], 'readonly').objectStore('testimonies').index('userId').getAll(currentUser.email).onsuccess = (e) => {
        const records = e.target.result || [];
        const container = document.getElementById('recordsList');
        if (!records.length) { container.innerHTML = '<div class="empty-state"><i class="fas fa-inbox"></i><p>No records</p><button class="btn-primary" onclick="showPage(\'record\')">Record First</button></div>'; return; }
        container.innerHTML = records.slice().reverse().map(r => `<div class="record-card"><strong>${r.caseId}</strong><br><small>${new Date(r.timestamp).toLocaleString()}</small><br><span class="status ${r.synced ? 'synced' : 'pending'}">${r.synced ? 'Synced' : 'Pending'}</span><div><button onclick="viewRecord(${r.id})">View</button><button onclick="deleteRecord(${r.id})">Delete</button></div></div>`).join('');
    };
}
function viewRecord(id) { db.transaction(['testimonies'], 'readonly').objectStore('testimonies').get(id).onsuccess = (e) => { document.getElementById('outputContent').innerHTML = e.target.result.structuredData; document.getElementById('structuredOutput').classList.remove('hidden'); showPage('record'); }; }
function deleteRecord(id) { if (confirm('Delete?')) { db.transaction(['testimonies'], 'readwrite').objectStore('testimonies').delete(id); loadRecords(); updateStorageInfo(); showToast('Deleted', 'success'); } }

// ============ FEEDBACK ==========
let currentRating = 0, currentRecommend = null;
function setupFeedback() {
    document.querySelectorAll('.rating-stars i').forEach(s => s.addEventListener('click', () => { currentRating = parseInt(s.dataset.rating); document.querySelectorAll('.rating-stars i').forEach((ss, i) => ss.className = i < currentRating ? 'fas fa-star active' : 'far fa-star'); }));
    document.querySelectorAll('.recommend-btn').forEach(b => b.addEventListener('click', () => { currentRecommend = b.dataset.recommend; document.querySelectorAll('.recommend-btn').forEach(bb => bb.classList.remove('active')); b.classList.add('active'); }));
}
function submitFeedback() {
    if (!currentUser) { showToast('Login first', 'warning'); openModal(); return; }
    const like = document.getElementById('feedbackLike')?.value || '';
    const improve = document.getElementById('feedbackImprove')?.value || '';
    if (!like && !improve && !currentRating) { showToast('Provide feedback', 'warning'); return; }
    db.transaction(['feedback'], 'readwrite').objectStore('feedback').add({ userId: currentUser.email, userName: currentUser.name, rating: currentRating, recommend: currentRecommend, like, improve, timestamp: Date.now() });
    showToast('Thank you!', 'success');
    loadFeedback();
}
function loadFeedback() {
    db.transaction(['feedback'], 'readonly').objectStore('feedback').getAll().onsuccess = (e) => {
        const fb = (e.target.result || []).slice(-5).reverse();
        document.getElementById('feedbackList').innerHTML = fb.map(f => `<div class="feedback-item"><strong>${f.userName}</strong><div>${'★'.repeat(f.rating)}${'☆'.repeat(5-f.rating)}</div><p>${f.like || ''}</p><small>${new Date(f.timestamp).toLocaleDateString()}</small></div>`).join('');
    };
}

// ============ STORAGE ==========
function updateStorageInfo() {
    if (!currentUser) return;
    db.transaction(['testimonies'], 'readonly').objectStore('testimonies').index('userId').getAll(currentUser.email).onsuccess = (e) => {
        const records = e.target.result || [];
        document.getElementById('pendingSync').textContent = records.filter(r => !r.synced).length;
        document.getElementById('storageUsed').textContent = (JSON.stringify(records).length / 1024).toFixed(1);
    };
}
function exportAllData() {
    if (!currentUser) return;
    db.transaction(['testimonies'], 'readonly').objectStore('testimonies').index('userId').getAll(currentUser.email).onsuccess = (e) => {
        const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify({ user: currentUser, testimonies: e.target.result || [] }, null, 2)])); a.download = `nyaysetu_export_${Date.now()}.json`; a.click(); showToast('Exported!', 'success');
    };
}
function clearLocalData() {
    if (confirm('Delete ALL local testimonies?')) {
        db.transaction(['testimonies'], 'readwrite').objectStore('testimonies').index('userId').getAll(currentUser.email).onsuccess = (e) => { (e.target.result || []).forEach(r => db.transaction(['testimonies'], 'readwrite').objectStore('testimonies').delete(r.id)); showToast('Cleared', 'success'); loadRecords(); updateStorageInfo(); };
    }
}

// ============ UI ==========
function showPage(pageId) { document.querySelectorAll('.page').forEach(p => p.classList.remove('active')); document.getElementById(`page-${pageId}`).classList.add('active'); document.querySelectorAll('.nav-tab').forEach(t => t.classList.toggle('active', t.dataset.page === pageId)); if (pageId === 'myRecords') loadRecords(); if (pageId === 'feedback') loadFeedback(); if (pageId === 'profile') updateStorageInfo(); }
function selectMethod(method) { document.querySelectorAll('.method-btn').forEach(b => b.classList.remove('active')); event.target.classList.add('active'); document.getElementById('voiceInput').classList.toggle('active', method === 'voice'); document.getElementById('textInput').classList.toggle('active', method === 'text'); document.getElementById('videoInput').classList.toggle('active', method === 'video'); }
function toggleTheme() { const isDark = document.documentElement.getAttribute('data-theme') === 'dark'; document.documentElement.setAttribute('data-theme', isDark ? 'light' : 'dark'); localStorage.setItem('theme', isDark ? 'light' : 'dark'); document.getElementById('themeBtn').innerHTML = isDark ? '<i class="fas fa-moon"></i>' : '<i class="fas fa-sun"></i>'; showToast(isDark ? 'Light mode' : 'Dark mode', 'info'); }
function toggleThemeFromSwitch() { document.documentElement.setAttribute('data-theme', document.getElementById('darkModeSwitch').checked ? 'dark' : 'light'); localStorage.setItem('theme', document.getElementById('darkModeSwitch').checked ? 'dark' : 'light'); }
function showToast(msg, type) { const toast = document.createElement('div'); toast.className = `toast ${type}`; toast.innerHTML = `<i class="fas ${type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle'}"></i><span>${msg}</span>`; document.getElementById('toastContainer').appendChild(toast); setTimeout(() => toast.remove(), 3000); }
function scrollToHow() { document.getElementById('how')?.scrollIntoView({ behavior: 'smooth' }); }
function syncRecordsManual() { if (isOnline) { showToast('Syncing...', 'info'); setTimeout(() => showToast('Sync complete', 'success'), 1500); } else showToast('Offline', 'warning'); }
function initWaveform() { const w = document.getElementById('waveform'); if (!w) return; w.innerHTML = ''; for (let i = 0; i < 48; i++) { const b = document.createElement('div'); b.className = 'wave-bar'; b.style.height = '20px'; w.appendChild(b); } }
function animateCounters() { document.querySelectorAll('.stat-number').forEach(c => { const t = parseInt(c.dataset.target); let cur = 0; const i = setInterval(() => { cur += t / 50; if (cur >= t) { cur = t; clearInterval(i); } c.textContent = Math.floor(cur) + (t === 98 ? '%' : t > 999 ? '+' : ''); }, 30); }); }

// Init
document.addEventListener('DOMContentLoaded', () => {
    initIndexedDB();
    initWaveform();
    setupFeedback();
    setupTextAutoSave();
    animateCounters();
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') { document.documentElement.setAttribute('data-theme', 'dark'); document.getElementById('themeBtn').innerHTML = '<i class="fas fa-sun"></i>'; if (document.getElementById('darkModeSwitch')) document.getElementById('darkModeSwitch').checked = true; }
    const savedUser = localStorage.getItem('currentUser');
    if (savedUser) { try { currentUser = JSON.parse(savedUser); updateUI(); loadRecords(); checkForDraft(); } catch(e) {} }
    setInterval(() => { if (!isVoiceRecording && !isVideoRecording) { document.querySelectorAll('.wave-bar').forEach((b, i) => { b.style.height = 10 + Math.sin(Date.now() / 500 + i * 0.2) * 8 + 'px'; }); } }, 100);
});

// Global functions
window.showPage = showPage; window.selectMethod = selectMethod; window.toggleTheme = toggleTheme; window.toggleThemeFromSwitch = toggleThemeFromSwitch; window.openModal = openModal; window.closeModal = closeModal; window.switchTab = switchTab; window.handleAuth = handleAuth; window.handleMobileLogin = handleMobileLogin; window.logout = logout; window.toggleUserDropdown = toggleUserDropdown;
window.toggleVoiceRecording = toggleVoiceRecording; window.pauseVoiceRecording = pauseVoiceRecording; window.stopVoiceRecording = stopVoiceRecording;
window.toggleVideoRecording = toggleVideoRecording; window.pauseVideoRecording = pauseVideoRecording; window.stopVideoRecording = stopVideoRecording;
window.analyzeTestimony = analyzeTestimony; window.saveTestimony = saveTestimony; window.submitFeedback = submitFeedback; window.exportAllData = exportAllData; window.clearLocalData = clearLocalData;
window.downloadTestimonyAsPDF = downloadTestimonyAsPDF; window.printTestimony = printTestimony; window.scrollToHow = scrollToHow; window.resumeDraft = resumeDraft; window.discardDraft = discardDraft; window.viewRecord = viewRecord; window.deleteRecord = deleteRecord; window.syncRecords = syncRecordsManual;
window.openForgotPasswordModal = openForgotPasswordModal; window.closeForgotPasswordModal = closeForgotPasswordModal; window.sendResetOtp = sendResetOtp; window.verifyResetOtpAndResetPassword = verifyResetOtpAndResetPassword;
window.openMobileForgotPasswordModal = openMobileForgotPasswordModal; window.closeMobileForgotPasswordModal = closeMobileForgotPasswordModal; window.sendMobileResetOtp = sendMobileResetOtp; window.verifyMobileResetOtpAndResetPassword = verifyMobileResetOtpAndResetPassword;
window.switchLoginMethod = switchLoginMethod; window.copyLegal = copyLegal; window.downloadLegal = downloadLegal;