const mongoose = require('mongoose');

const stockAdjustmentSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    variant: {
      type: String, // Store variant name if applicable (e.g., "Red-XL")
      default: '',
    },
    adjustmentType: {
      type: String,
      enum: ['Damaged', 'Lost', 'Found', 'Correction'],
      required: true,
    },
    correctionDirection: {
      type: String,
      enum: ['Increase', 'Decrease'],
      default: 'Decrease',
    },
    quantity: {
      type: Number,
      required: true,
    },
    reason: {
      type: String,
      required: true,
    },
    note: {
      type: String,
      default: '',
    },
    date: {
      type: Date,
      default: Date.now,
    },
    adjustedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    adjustedByName: {
      type: String,
      required: true,
    },
    landedCostPerUnit: {
      type: Number,
      default: 0,
    },
    totalLossAmount: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('StockAdjustment', stockAdjustmentSchema);
