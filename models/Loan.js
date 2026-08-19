const mongoose = require('mongoose');

const repaymentSchema = mongoose.Schema(
  {
    amountPaid: {
      type: Number,
      required: true,
    },
    paidDate: {
      type: Date,
      required: true,
      default: Date.now,
    },
    note: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

const loanSchema = mongoose.Schema(
  {
    lenderName: {
      type: String,
      required: true,
    },
    phone: {
      type: String,
      default: '',
    },
    amountTaken: {
      type: Number,
      required: true,
    },
    takenDate: {
      type: Date,
      required: true,
      default: Date.now,
    },
    purpose: {
      type: String,
      default: '',
    },
    repayments: [repaymentSchema],
    status: {
      type: String,
      enum: ['Pending', 'Completed'],
      default: 'Pending',
    },
    note: {
      type: String,
      default: '',
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Loan', loanSchema);
