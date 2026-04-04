const express = require('express');
const { authMiddleware, legalAccessMiddleware } = require('../middleware/auth');
const Testimony = require('../models/Testimony');
const User = require('../models/User');

const router = express.Router();

// Get testimony for legal review (with consent check)
router.get('/access/:testimonyId', 
  authMiddleware, 
  legalAccessMiddleware, 
  async (req, res) => {
    try {
      const testimony = await Testimony.findById(req.params.testimonyId);
      
      if (!testimony) {
        return res.status(404).json({ message: 'Testimony not found' });
      }
      
      // Check if user has consented to share
      const user = await User.findById(testimony.userId);
      if (!user.consentGiven || !user.consentedTo.includes('legal')) {
        return res.status(403).json({ 
          message: 'User has not consented to share this testimony with legal authorities' 
        });
      }
      
      // Log legal access
      testimony.accessLogs.push({
        userId: req.user.userId,
        role: 'legal_official',
        timestamp: new Date(),
        action: 'legal_access',
        purpose: req.query.purpose || 'investigation'
      });
      
      await testimony.save();
      
      res.json({
        testimony: testimony.structuredData,
        metadata: {
          timestamp: testimony.timestamp,
          hash: testimony.hash,
          reviewed: testimony.status === 'reviewed'
        }
      });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  }
);

// Request user consent for legal access
router.post('/request-consent/:userId', 
  authMiddleware, 
  legalAccessMiddleware, 
  async (req, res) => {
    try {
      const { caseId, purpose, institution } = req.body;
      const user = await User.findById(req.params.userId);
      
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }
      
      // Create consent request notification
      user.consentRequests.push({
        caseId,
        purpose,
        institution,
        requestedBy: req.user.userId,
        requestedAt: new Date(),
        status: 'pending'
      });
      
      await user.save();
      
      res.json({ message: 'Consent request sent to user' });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  }
);

// Get audit log for testimony
router.get('/audit/:testimonyId', 
  authMiddleware, 
  legalAccessMiddleware, 
  async (req, res) => {
    try {
      const testimony = await Testimony.findById(req.params.testimonyId);
      
      if (!testimony) {
        return res.status(404).json({ message: 'Testimony not found' });
      }
      
      res.json({
        testimonyId: testimony._id,
        created: testimony.timestamp,
        lastModified: testimony.reviewedAt || testimony.timestamp,
        accessLogs: testimony.accessLogs,
        hash: testimony.hash
      });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  }
);

module.exports = router;