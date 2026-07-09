const mongoose = require('mongoose');

const expenseSchema = mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    userName: {
      type: String,
      required: true,
    },
    title: {
      type: String,
      required: true,
    },
    category: {
      type: String,
      required: true,
    },
    date: {
      type: Date,
      default: Date.now,
    },
    description: {
      type: String,
      default: '',
    },
    relatedProduct: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
    },
    giftTitle: {
      type: String,
    },
    giftType: {
      type: String,
    },
    amount: {
      type: Number,
      required: true,
      default: 0,
    },
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    recipientName: {
      type: String,
    },
    notes: {
      type: String,
      default: '',
    },
    selectedVariant: {
      type: String,
    },
    productCost: { type: Number, default: 0 },
    courierCost: { type: Number, default: 0 },
    transportCost: { type: Number, default: 0 },
    packagingCost: { type: Number, default: 0 },
    miscCost: { type: Number, default: 0 },
    isModeratorExpense: { type: Boolean, default: false }
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Expense', expenseSchema);
