const mongoose = require('mongoose');

const productEditRequestSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    description: {
      type: String,
    },
    images: [{
      type: String,
    }],
    priceSuggestion: {
      type: Number,
    },
    moderatorPriceSuggestion: {
      type: Number,
    },
    stockSuggestion: {
      type: Number,
    },
    moderator: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    status: {
      type: String,
      enum: ['Pending', 'Approved', 'Rejected'],
      default: 'Pending',
    },
    notes: {
      type: String,
      default: '',
    }
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('ProductEditRequest', productEditRequestSchema);
