const mongoose = require('mongoose');

const inventoryNoteSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      enum: ['Stock Out', 'New Stock Expected', 'Quality Issue', 'Other'],
      required: true,
      default: 'Other',
    },
    content: {
      type: String,
      required: true,
    },
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
    },
    moderator: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    }
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('InventoryNote', inventoryNoteSchema);
