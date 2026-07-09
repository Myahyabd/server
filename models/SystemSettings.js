const mongoose = require('mongoose');

const systemSettingsSchema = new mongoose.Schema(
  {
    deliverySettings: {
      type: {
        type: String,
        enum: ['Fixed', 'District', 'Courier'],
        default: 'Fixed',
      },
      fixedCharge: {
        type: Number,
        default: 80,
      },
      districtCharges: [
        {
          district: { type: String, required: true },
          charge: { type: Number, required: true },
        },
      ],
      courierCharges: [
        {
          courier: { type: String, required: true },
          charge: { type: Number, required: true },
        },
      ],
      freeDeliveryEnabled: {
        type: Boolean,
        default: false,
      },
      freeDeliveryMinAmount: {
        type: Number,
        default: 1000,
      },
      freeDeliveryProducts: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Product',
        },
      ],
      freeDeliveryCategories: [
        {
          type: String,
        },
      ],
    },
    codSettings: {
      enabled: {
        type: Boolean,
        default: true,
      },
      chargeType: {
        type: String,
        enum: ['Percentage', 'Fixed'],
        default: 'Percentage',
      },
      value: {
        type: Number,
        default: 1, // 1% or ৳20
      },
    },
    referralSettings: {
      enabled: {
        type: Boolean,
        default: true,
      },
      discountType: {
        type: String,
        enum: ['Percentage', 'Fixed'],
        default: 'Percentage',
      },
      value: {
        type: Number,
        default: 5, // 5% or ৳50
      },
      minOrder: {
        type: Number,
        default: 0,
      },
      maxDiscount: {
        type: Number,
        default: 200,
      },
      expiryDate: {
        type: Date,
        default: null,
      },
      usageLimit: {
        type: Number,
        default: null,
      },
      commissionType: {
        type: String,
        enum: ['Percentage', 'Fixed'],
        default: 'Fixed',
      },
      commissionValue: {
        type: Number,
        default: 50,
      },
    },
    paymentMethods: [
      {
        name: { type: String, required: true }, // e.g. COD, bKash, Nagad, Rocket
        enabled: { type: Boolean, default: true },
        instructions: { type: String, default: '' },
        accountNumber: { type: String, default: '' },
        requireSenderMobile: { type: Boolean, default: false },
        requireTransactionId: { type: Boolean, default: false },
        requireScreenshot: { type: Boolean, default: false },
      },
    ],
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('SystemSettings', systemSettingsSchema);
