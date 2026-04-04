const mongoose = require('mongoose');

const testimonySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'User' },
  type: { type: String, enum: ['voice', 'text'], required: true },
  originalText: String,
  transcription: String,
  structuredData: {
    timeline: [{
      timestamp: String,
      event: String,
      location: String,
      people: [String],
      emotions: [String]
    }],
    keyFacts: [String],
    summary: String,
    entities: {
      persons: [String],
      locations: [String],
      dates: [String]
    }
  },
  reviewedData: mongoose.Schema.Types.Mixed,
  status: { type: String, enum: ['pending', 'reviewed', 'verified'], default: 'pending' },
  s3Path: String,
  hash: String,
  timestamp: Date,
  reviewedAt: Date,
  accessLogs: [{
    userId: mongoose.Schema.Types.ObjectId,
    role: String,
    timestamp: Date,
    action: String,
    purpose: String
  }]
});

module.exports = mongoose.model('Testimony', testimonySchema);