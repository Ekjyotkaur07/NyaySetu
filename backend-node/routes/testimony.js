const express = require('express');
const multer = require('multer');
const crypto = require('crypto-js');
const cryptoNode = require('crypto'); // ← ADD THIS for Node crypto
const AWS = require('aws-sdk');
const { authMiddleware } = require('../middleware/auth');
const Testimony = require('../models/Testimony');
const axios = require('axios');

// Configure AWS S3
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY,
  secretAccessKey: process.env.AWS_SECRET_KEY,
  region: process.env.AWS_REGION
});

// Submit voice testimony
router.post('/voice', authMiddleware, upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No audio file provided' });
    }
    
    // Encrypt audio before upload
    const encryptedAudio = crypto.AES.encrypt(
      req.file.buffer.toString('base64'),
      req.user.encryptionKey || process.env.MASTER_ENCRYPTION_KEY
    ).toString();
    
    // Upload to S3
    const s3Key = `testimonies/${req.user.userId}/${Date.now()}_audio.enc`;
    await s3.putObject({
      Bucket: process.env.S3_BUCKET,
      Key: s3Key,
      Body: encryptedAudio,
      Metadata: {
        userId: req.user.userId,
        timestamp: Date.now().toString()
      }
    }).promise();
    
    // Send to Python AI service for transcription
    const pythonResponse = await axios.post('http://localhost:8000/transcribe', {
      audioBuffer: req.file.buffer.toString('base64')
    });
    
    const transcription = pythonResponse.data.transcription;
    
    // Structure the testimony
    const structuredData = await axios.post('http://localhost:8000/structure', {
      text: transcription
    });
    
    // Save to database
    const testimony = new Testimony({
      userId: req.user.userId,
      type: 'voice',
      transcription,
      structuredData: structuredData.data,
      s3Path: s3Key,
      timestamp: new Date(),
      hash: crypto.SHA256(transcription + Date.now()).toString()
    });
    
    await testimony.save();
    
    res.status(201).json({
      message: 'Testimony submitted successfully',
      testimonyId: testimony._id,
      transcription,
      structuredData: structuredData.data
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
});

// Submit text testimony
router.post('/text', authMiddleware, async (req, res) => {
  try {
    const { text } = req.body;
    
    if (!text || text.length < 10) {
      return res.status(400).json({ message: 'Text testimony too short' });
    }
    
    // Structure the testimony
    const structuredData = await axios.post('http://localhost:8000/structure', {
      text: text
    });
    
    const testimony = new Testimony({
      userId: req.user.userId,
      type: 'text',
      originalText: text,
      structuredData: structuredData.data,
      timestamp: new Date(),
      hash: crypto.SHA256(text + Date.now()).toString()
    });
    
    await testimony.save();
    
    res.status(201).json({
      message: 'Testimony submitted successfully',
      testimonyId: testimony._id,
      structuredData: structuredData.data
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get user's testimonies
router.get('/my', authMiddleware, async (req, res) => {
  try {
    const testimonies = await Testimony.find({ userId: req.user.userId })
      .sort({ timestamp: -1 });
    
    res.json(testimonies);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get single testimony (with access control)
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const testimony = await Testimony.findById(req.params.id);
    
    if (!testimony) {
      return res.status(404).json({ message: 'Testimony not found' });
    }
    
    // Check access rights
    if (testimony.userId.toString() !== req.user.userId && 
        req.user.role !== 'legal_official' && 
        req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    // Log access for audit
    await Testimony.findByIdAndUpdate(req.params.id, {
      $push: {
        accessLogs: {
          userId: req.user.userId,
          role: req.user.role,
          timestamp: new Date(),
          action: 'view'
        }
      }
    });
    
    res.json(testimony);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Update testimony (review/edit by user)
router.put('/:id/review', authMiddleware, async (req, res) => {
  try {
    const { reviewedData } = req.body;
    const testimony = await Testimony.findOne({
      _id: req.params.id,
      userId: req.user.userId
    });
    
    if (!testimony) {
      return res.status(404).json({ message: 'Testimony not found' });
    }
    
    testimony.reviewedData = reviewedData;
    testimony.status = 'reviewed';
    testimony.reviewedAt = new Date();
    testimony.hash = crypto.SHA256(JSON.stringify(reviewedData) + Date.now()).toString();
    
    await testimony.save();
    
    res.json({ message: 'Testimony updated', testimony });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;