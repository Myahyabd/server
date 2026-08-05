const mongoose = require('mongoose');

const affiliateClickSchema = new mongoose.Schema(
  {
    affiliate: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true
    },
    ip: {
      type: String,
      default: ''
    },
    device: {
      type: String,
      default: ''
    },
    browser: {
      type: String,
      default: ''
    },
    referralSource: {
      type: String,
      default: ''
    },
    isConverted: {
      type: Boolean,
      default: false
    },
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      default: null
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model('AffiliateClick', affiliateClickSchema);
