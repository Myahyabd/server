const mongoose = require('mongoose');

const AffiliateTaskSubmissionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  taskType: {
    type: String,
    enum: ['VideoPromotion', 'SocialShare', 'Other'],
    default: 'VideoPromotion',
  },
  videoUrl: {
    type: String,
    required: true,
  },
  coinsReward: {
    type: Number,
    default: 50,
  },
  status: {
    type: String,
    enum: ['Pending', 'Approved', 'Rejected'],
    default: 'Pending',
  },
  adminNote: {
    type: String,
    default: '',
  },
}, { timestamps: true });

module.exports = mongoose.model('AffiliateTaskSubmission', AffiliateTaskSubmissionSchema);
