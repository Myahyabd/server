const mongoose = require('mongoose');

const orderSchema = mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,

      ref: 'User',

      required: true,
    },

    orderItems: [
      {
        name: {
          type: String,
          required: true,
        },

        image: {
          type: String,
          required: true,
        },

        price: {
          type: Number,
          required: true,
        },

        qty: {
          type: Number,
          required: true,
        },

        product: {
          type: mongoose.Schema.Types.ObjectId,

          ref: 'Product',

          required: true,
        },
        variant: {
          type: String,
          default: '',
        },
      },
    ],

    shippingAddress: {
      fullName: {
        type: String,
        required: true,
      },
      phone: {
        type: String,
        required: true,
      },
      address: {
        type: String,
        required: true,
      },
      thana: {
        type: String,
        required: true,
      },
      district: {
        type: String,
        required: true,
      },
    },

    paymentMethod: {
      type: String,

      default: 'Cash On Delivery',
    },

    totalPrice: {
      type: Number,

      required: true,

      default: 0,
    },

    deliveryCharge: {
      type: Number,
      default: 0,
    },

    discount: {
      type: Number,
      default: 0,
    },

    // NEW STATUS SYSTEM
    status: {
      type: String,

      enum: [
        'Pending',
        'Processing',
        'Shipped',
        'Delivered',
        'Cancelled',
        'Returned',
      ],

      default: 'Pending',
    },

    isDelivered: {
      type: Boolean,

      default: false,
    },

    deliveredAt: Date,

    returnReason: {
      type: String,
      default: '',
    },
  },

  {
    timestamps: true,
  },
);

module.exports = mongoose.model('Order', orderSchema);
