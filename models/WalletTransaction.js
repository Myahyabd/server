const mongoose = require('mongoose');

const walletTransactionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    type: {
      type: String,
      enum: ['Commission', 'Withdrawal_Request', 'Withdrawal_Approved', 'Withdrawal_Rejected', 'Manual_Adjustment'],
      required: true
    },
    amount: {
      type: Number,
      required: true
    },
    balanceAfter: {
      type: Number,
      required: true
    },
    status: {
      type: String,
      default: 'Completed'
    },
    note: {
      type: String,
      default: ''
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

module.exports = mongoose.model('WalletTransaction', walletTransactionSchema);
