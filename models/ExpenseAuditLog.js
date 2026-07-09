const mongoose = require('mongoose');

const expenseAuditLogSchema = mongoose.Schema(
  {
    expenseId: {
      type: mongoose.Schema.Types.ObjectId,
    },
    action: {
      type: String,
      enum: ['CREATE', 'UPDATE', 'DELETE'],
      required: true,
    },
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    performedByName: {
      type: String,
      required: true,
    },
    details: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('ExpenseAuditLog', expenseAuditLogSchema);
