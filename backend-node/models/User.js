const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  name: { type: String, required: true },
  role: { type: String, enum: ['survivor', 'legal_official', 'ngo_worker', 'admin'], default: 'survivor' },
  encryptionKey: { type: String, required: true },
  consentGiven: { type: Boolean, default: false },
  consentedTo: [{ type: String }],
  consentRequests: [{
    caseId: String,
    purpose: String,
    institution: String,
    requestedBy: mongoose.Schema.Types.ObjectId,
    requestedAt: Date,
    status: { type: String, enum: ['pending', 'approved', 'denied'], default: 'pending' }
  }],
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', userSchema);