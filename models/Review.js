const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['Product', 'Store'],
      default: 'Product',
      required: true
    },
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: function() { return this.type === 'Product'; }
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: false
    },
    reviewerName: {
      type: String,
      required: true
    },
    reviewerRole: {
      type: String,
      enum: ['customer', 'moderator', 'admin', 'vip', 'wholesale'],
      default: 'customer'
    },
    rating: {
      type: Number,
      min: 1,
      max: 5,
      required: true
    },
    title: {
      type: String,
      default: ''
    },
    comment: {
      type: String,
      required: true
    },
    images: {
      type: [String],
      default: []
    },
    helpfulUsers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }
    ],
    reportedUsers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }
    ],
    status: {
      type: String,
      enum: ['Pending', 'Approved', 'Rejected', 'Hidden'],
      default: 'Pending'
    },
    isFeatured: {
      type: Boolean,
      default: false
    },
    // Detailed ratings specific to Store/Brand overall reviews
    storeRatings: {
      service: { type: Number, default: 5 },
      delivery: { type: Number, default: 5 },
      packaging: { type: Number, default: 5 },
      productQuality: { type: Number, default: 5 },
      customerSupport: { type: Number, default: 5 },
      overallExperience: { type: Number, default: 5 }
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model('Review', reviewSchema);
