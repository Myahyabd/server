const mongoose = require('mongoose');

const stockHistorySchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },

    action: {
      type: String,
      enum: [
        'ORDER_CREATED',
        'ORDER_CANCELLED',
        'ORDER_RETURNED',
        'MANUAL_ADD',
        'MANUAL_REMOVE',
      ],
      required: true,
    },

    quantity: {
      type: Number,
      required: true,
    },

    stockBefore: {
      type: Number,
      required: true,
    },

    stockAfter: {
      type: Number,
      required: true,
    },

    note: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model('StockHistory', stockHistorySchema);
