const mongoose = require('mongoose');

const cartLogSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    sessionToken: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    items: [
      {
        product: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Product',
        },
        variant: {
          type: String,
        },
        price: {
          type: Number,
        },
        qty: {
          type: Number,
        },
      },
    ],
    isAbandoned: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('CartLog', cartLogSchema);
