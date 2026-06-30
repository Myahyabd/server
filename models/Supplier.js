const mongoose = require('mongoose');

const supplierSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    contactPerson: {
      type: String,
      default: '',
    },
    phone: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    alternativePhone: {
      type: String,
      default: '',
    },
    facebookLink: {
      type: String,
      default: '',
    },
    whatsAppNumber: {
      type: String,
      default: '',
    },
    address: {
      type: String,
      default: '',
    },
    notes: {
      type: String,
      default: '',
    },
    purchaseCount: {
      type: Number,
      default: 0,
    },
    lastPurchaseDate: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Supplier', supplierSchema);
