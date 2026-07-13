const mongoose = require('mongoose');

const purchaseInvoiceSchema = new mongoose.Schema(
  {
    invoiceNumber: {
      type: String,
      required: true,
      unique: true,
    },
    supplier: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Supplier',
      required: true,
    },
    items: [
      {
        product: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Product',
          required: true,
        },
        variantName: {
          type: String,
          default: '',
        },
        quantity: {
          type: Number,
          required: true,
        },
        purchasePrice: {
          type: Number,
          required: true, // Base cost for this item (total)
        },
        proportionalDelivery: {
          type: Number,
          default: 0,
        },
        proportionalDiscount: {
          type: Number,
          default: 0,
        },
        totalCost: {
          type: Number,
          required: true, // purchasePrice + proportionalDelivery - proportionalDiscount
        },
        landedCost: {
          type: Number,
          required: true, // totalCost / quantity
        },
      }
    ],
    deliveryCost: {
      type: Number,
      default: 0,
    },
    discount: {
      type: Number,
      default: 0,
    },
    subTotal: {
      type: Number,
      required: true, // Sum of base prices
    },
    totalAmount: {
      type: Number,
      required: true, // subTotal + deliveryCost - discount
    },
    notes: {
      type: String,
      default: '',
    },
    purchasedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    expenseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Expense'
    }
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('PurchaseInvoice', purchaseInvoiceSchema);
