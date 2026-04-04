const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');

const app = express();

// Enable CORS for frontend
app.use(cors({
    origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
    credentials: true
}));
app.use(express.json());

// Configure multer for audio upload
const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    }
});

let db;

// ============ LANGUAGE DETECTION ============
function detectLanguage(text) {
    const patterns = {
        'hindi': /[अ-ह]/,
        'spanish': /[áéíóúñ¿¡]/,
        'french': /[àâæçéèêëïîôœùûü]/,
        'german': /[äöüß]/,
        'arabic': /[\u0600-\u06FF]/,
        'chinese': /[\u4e00-\u9fff]/,
        'japanese': /[\u3040-\u30ff]/,
        'russian': /[а-яА-Я]/,
        'tamil': /[அ-ஔ]/,
        'telugu': /[క-౯]/,
        'bengali': /[ঀ-৿]/,
        'urdu': /[\u0600-\u06FF]/,
        'punjabi': /[ਅ-ੴ]/
    };
    
    for (const [lang, pattern] of Object.entries(patterns)) {
        if (pattern.test(text)) {
            return lang;
        }
    }
    return 'english';
}

const languageNames = {
    'english': 'English',
    'hindi': 'हिन्दी (Hindi)',
    'spanish': 'Español (Spanish)',
    'french': 'Français (French)',
    'german': 'Deutsch (German)',
    'arabic': 'العربية (Arabic)',
    'chinese': '中文 (Chinese)',
    'japanese': '日本語 (Japanese)',
    'russian': 'Русский (Russian)',
    'tamil': 'தமிழ் (Tamil)',
    'telugu': 'తెలుగు (Telugu)',
    'bengali': 'বাংলা (Bengali)',
    'urdu': 'اردو (Urdu)',
    'punjabi': 'ਪੰਜਾਬੀ (Punjabi)'
};

function structureInLanguage(text, detectedLang) {
    const templates = {
        'english': {
            summary: 'Summary',
            keyFacts: 'Key Facts',
            timeline: 'Timeline of Events',
            event: 'Event',
            location: 'Location',
            people: 'People',
            emotions: 'Emotions',
            quality: 'Quality Assessment',
            score: 'Score',
            missing: 'Missing Information',
            recommendations: 'Recommendations'
        },
        'hindi': {
            summary: 'सारांश',
            keyFacts: 'मुख्य तथ्य',
            timeline: 'समयरेखा',
            event: 'घटना',
            location: 'स्थान',
            people: 'लोग',
            emotions: 'भावनाएं',
            quality: 'गुणवत्ता मूल्यांकन',
            score: 'स्कोर',
            missing: 'गुम जानकारी',
            recommendations: 'सिफारिशें'
        },
        'spanish': {
            summary: 'Resumen',
            keyFacts: 'Hechos Clave',
            timeline: 'Cronología',
            event: 'Evento',
            location: 'Ubicación',
            people: 'Personas',
            emotions: 'Emociones',
            quality: 'Evaluación de Calidad',
            score: 'Puntuación',
            missing: 'Información Faltante',
            recommendations: 'Recomendaciones'
        },
        'french': {
            summary: 'Résumé',
            keyFacts: 'Faits Clés',
            timeline: 'Chronologie',
            event: 'Événement',
            location: 'Emplacement',
            people: 'Personnes',
            emotions: 'Émotions',
            quality: 'Évaluation de la Qualité',
            score: 'Score',
            missing: 'Informations Manquantes',
            recommendations: 'Recommandations'
        }
    };
    
    const t = templates[detectedLang] || templates.english;
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 10);
    
    // Create timeline with proper timestamps
    const timeline = [];
    const now = new Date();
    
    for (let i = 0; i < Math.min(sentences.length, 5); i++) {
        const eventTime = new Date(now.getTime() - (sentences.length - i) * 60000);
        timeline.push({
            timestamp: eventTime.toLocaleTimeString(),
            event: sentences[i].trim(),
            location: 'Not specified',
            people: [],
            emotions: []
        });
    }
    
    return {
        detectedLanguage: languageNames[detectedLang] || 'English',
        languageCode: detectedLang,
        summaryLabel: t.summary,
        keyFactsLabel: t.keyFacts,
        timelineLabel: t.timeline,
        qualityLabel: t.quality,
        scoreLabel: t.score,
        missingLabel: t.missing,
        recommendationsLabel: t.recommendations,
        summary: text.substring(0, 300) + (text.length > 300 ? '...' : ''),
        keyFacts: sentences.slice(0, 3).map(s => s.trim()),
        timeline: timeline,
        qualityAssessment: {
            score: 75,
            missing: ['More specific dates would strengthen this testimony'],
            recommendations: ['Add specific dates, locations, and people involved if possible']
        }
    };
}

// ============ DATABASE INITIALIZATION ============
async function initDB() {
    db = await open({
        filename: './testiforge.db',
        driver: sqlite3.Database
    });
    
    // Create users table
    await db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            email TEXT UNIQUE,
            password TEXT,
            name TEXT,
            role TEXT,
            encryptionKey TEXT,
            createdAt INTEGER
        )
    `);
    
    // Create testimonies table with all required columns
    await db.exec(`
        CREATE TABLE IF NOT EXISTS testimonies (
            id TEXT PRIMARY KEY,
            caseId TEXT,
            userId TEXT,
            type TEXT,
            originalText TEXT,
            detectedLanguage TEXT,
            structuredData TEXT,
            status TEXT,
            timestamp INTEGER,
            duration INTEGER,
            hash TEXT
        )
    `);
    
    console.log('✅ Database ready with all columns');
}

// ============ HEALTH CHECKS ============
app.get('/health', (req, res) => {
    res.json({ status: 'OK', message: 'Server is running', timestamp: Date.now() });
});

app.get('/api/test', (req, res) => {
    res.json({ message: 'API is working!' });
});

// ============ AUTHENTICATION ENDPOINTS ============
app.post('/api/auth/register', async (req, res) => {
    console.log('📝 Register request:', req.body.email);
    
    try {
        const { email, password, name, role = 'survivor' } = req.body;
        
        if (!email || !password || !name) {
            return res.status(400).json({ message: 'All fields are required' });
        }
        
        const existing = await db.get('SELECT * FROM users WHERE email = ?', [email]);
        if (existing) {
            return res.status(400).json({ message: 'User already exists' });
        }
        
        const hashedPassword = await bcrypt.hash(password, 10);
        const userId = uuidv4();
        const encryptionKey = crypto.randomBytes(32).toString('hex');
        
        await db.run(
            'INSERT INTO users (id, email, password, name, role, encryptionKey, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [userId, email, hashedPassword, name, role, encryptionKey, Date.now()]
        );
        
        const token = jwt.sign(
            { userId, email, role, name },
            'testiforge-secret-key',
            { expiresIn: '7d' }
        );
        
        console.log('✅ User registered:', email);
        
        res.json({
            success: true,
            message: 'User created successfully',
            token,
            user: { id: userId, email, name, role }
        });
        
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ message: 'Server error: ' + error.message });
    }
});

app.post('/api/auth/login', async (req, res) => {
    console.log('🔐 Login request:', req.body.email);
    
    try {
        const { email, password } = req.body;
        
        const user = await db.get('SELECT * FROM users WHERE email = ?', [email]);
        if (!user) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }
        
        const valid = await bcrypt.compare(password, user.password);
        if (!valid) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }
        
        const token = jwt.sign(
            { userId: user.id, email: user.email, role: user.role, name: user.name },
            'testiforge-secret-key',
            { expiresIn: '7d' }
        );
        
        console.log('✅ User logged in:', email);
        
        res.json({
            success: true,
            message: 'Login successful',
            token,
            user: { id: user.id, email: user.email, name: user.name, role: user.role }
        });
        
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

app.get('/api/auth/verify', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ message: 'No token provided' });
    }
    
    try {
        const decoded = jwt.verify(token, 'testiforge-secret-key');
        res.json({ user: decoded });
    } catch (error) {
        res.status(401).json({ message: 'Invalid token' });
    }
});

// ============ TEXT TESTIMONY ENDPOINT ============
app.post('/api/testimony/text', async (req, res) => {
    console.log('📝 Text testimony submission received');
    
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) {
            return res.status(401).json({ message: 'No token provided' });
        }
        
        const decoded = jwt.verify(token, 'testiforge-secret-key');
        const userId = decoded.userId;
        const { text } = req.body;
        
        if (!text || text.length < 10) {
            return res.status(400).json({ message: 'Testimony too short (minimum 10 characters)' });
        }
        
        const detectedLang = detectLanguage(text);
        console.log(`🌍 Detected language: ${detectedLang}`);
        
        const structuredData = structureInLanguage(text, detectedLang);
        
        const testimonyId = uuidv4();
        const caseId = `CASE-TXT-${Date.now()}`;
        const hash = crypto.randomBytes(16).toString('hex');
        
        await db.run(
            `INSERT INTO testimonies (id, caseId, userId, type, originalText, detectedLanguage, structuredData, status, timestamp, duration, hash) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [testimonyId, caseId, userId, 'text', text, detectedLang, JSON.stringify(structuredData), 'pending', Date.now(), 0, hash]
        );
        
        console.log(`✅ Text testimony saved! ID: ${testimonyId}`);
        
        res.json({
            success: true,
            message: `Testimony submitted successfully in ${languageNames[detectedLang] || 'English'}`,
            testimonyId: testimonyId,
            detectedLanguage: languageNames[detectedLang] || 'English',
            structuredData: structuredData
        });
        
    } catch (error) {
        console.error('❌ Testimony error:', error);
        res.status(500).json({ message: 'Server error: ' + error.message });
    }
});

// ============ VOICE TESTIMONY ENDPOINT - FIXED ============
app.post('/api/testimony/voice', upload.single('audio'), async (req, res) => {
    console.log('🎤 Voice testimony submission received');
    
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) {
            return res.status(401).json({ message: 'No token provided' });
        }
        
        const decoded = jwt.verify(token, 'testiforge-secret-key');
        const userId = decoded.userId;
        
        if (!req.file) {
            return res.status(400).json({ message: 'No audio file provided' });
        }
        
        const audioDuration = req.body.duration || Math.floor(req.file.size / 16000); // Approximate duration
        console.log(`📁 Audio file received: ${req.file.originalname}, Size: ${req.file.size} bytes, Duration: ${audioDuration}s`);
        
        // Sample transcription with timestamp
        const timestamp = new Date().toLocaleString();
        const sampleTranscription = `Voice testimony recorded on ${timestamp}. Duration: ${audioDuration} seconds. Content: This is a sample transcription of your voice testimony. In production, this would use OpenAI's Whisper API for accurate speech-to-text conversion.`;
        
        const detectedLang = detectLanguage(sampleTranscription);
        console.log(`🌍 Detected language: ${detectedLang}`);
        
        const structuredData = structureInLanguage(sampleTranscription, detectedLang);
        
        const testimonyId = uuidv4();
        const caseId = `CASE-VCE-${Date.now()}`;
        const hash = crypto.randomBytes(16).toString('hex');
        
        await db.run(
            `INSERT INTO testimonies (id, caseId, userId, type, originalText, detectedLanguage, structuredData, status, timestamp, duration, hash) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [testimonyId, caseId, userId, 'voice', sampleTranscription, detectedLang, JSON.stringify(structuredData), 'pending', Date.now(), audioDuration, hash]
        );
        
        console.log(`✅ Voice testimony saved! ID: ${testimonyId}, Case ID: ${caseId}`);
        
        res.json({
            success: true,
            message: `Voice testimony submitted successfully in ${languageNames[detectedLang] || 'English'}`,
            testimonyId: testimonyId,
            caseId: caseId,
            transcription: sampleTranscription,
            duration: audioDuration,
            detectedLanguage: languageNames[detectedLang] || 'English',
            structuredData: structuredData
        });
        
    } catch (error) {
        console.error('❌ Voice testimony error:', error);
        res.status(500).json({ message: 'Server error: ' + error.message });
    }
});

// ============ TESTIMONY RETRIEVAL ============
app.get('/api/testimony/my', async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) {
            return res.status(401).json({ message: 'No token provided' });
        }
        
        const decoded = jwt.verify(token, 'testiforge-secret-key');
        const userId = decoded.userId;
        
        const testimonies = await db.all(
            'SELECT * FROM testimonies WHERE userId = ? ORDER BY timestamp DESC',
            [userId]
        );
        
        const parsed = testimonies.map(t => ({
            ...t,
            structuredData: t.structuredData ? JSON.parse(t.structuredData) : null,
            createdDate: new Date(t.timestamp).toLocaleString(),
            durationFormatted: t.duration ? `${Math.floor(t.duration / 60)}:${(t.duration % 60).toString().padStart(2, '0')}` : 'N/A'
        }));
        
        console.log(`📋 Retrieved ${parsed.length} testimonies for user ${userId}`);
        
        res.json(parsed);
        
    } catch (error) {
        console.error('Error fetching testimonies:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

app.get('/api/testimony/:id', async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) {
            return res.status(401).json({ message: 'No token provided' });
        }
        
        const decoded = jwt.verify(token, 'testiforge-secret-key');
        const userId = decoded.userId;
        const testimonyId = req.params.id;
        
        const testimony = await db.get(
            'SELECT * FROM testimonies WHERE id = ? AND userId = ?',
            [testimonyId, userId]
        );
        
        if (!testimony) {
            return res.status(404).json({ message: 'Testimony not found' });
        }
        
        testimony.structuredData = testimony.structuredData ? JSON.parse(testimony.structuredData) : null;
        testimony.createdDate = new Date(testimony.timestamp).toLocaleString();
        
        res.json(testimony);
        
    } catch (error) {
        console.error('Error fetching testimony:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

app.put('/api/testimony/:id/review', async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) {
            return res.status(401).json({ message: 'No token provided' });
        }
        
        const decoded = jwt.verify(token, 'testiforge-secret-key');
        const userId = decoded.userId;
        const testimonyId = req.params.id;
        const { reviewedData } = req.body;
        
        await db.run(
            `UPDATE testimonies SET structuredData = ?, status = ? WHERE id = ? AND userId = ?`,
            [JSON.stringify(reviewedData), 'reviewed', testimonyId, userId]
        );
        
        res.json({ message: 'Testimony updated successfully' });
        
    } catch (error) {
        console.error('Error updating testimony:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// ============ START SERVER ============
async function start() {
    await initDB();
    app.listen(5000, '0.0.0.0', () => {
        console.log('\n=========================================');
        console.log('🚀 TestiForge Backend is Running!');
        console.log('📍 http://localhost:5000');
        console.log('💚 Health check: http://localhost:5000/health');
        console.log('🎤 Voice recording supported!');
        console.log('🌍 Multi-language support enabled!');
        console.log('=========================================\n');
    });
}

start();