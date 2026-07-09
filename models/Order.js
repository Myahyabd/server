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
        buyingCost: {
          type: Number,
          default: 0,
        },
        moderatorPrice: {
          type: Number,
          default: 0,
        },
        sellingPrice: {
          type: Number,
          default: 0,
        },
        profitMargin: {
          type: Number,
          default: 0,
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
      alternativePhone: {
        type: String,
        default: '',
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
      division: {
        type: String,
        default: '',
      },
      courier: {
        type: String,
        default: '',
      },
    },

    paymentMethod: {
      type: String,
      default: 'Cash On Delivery',
    },

    paymentStatus: {
      type: String,
      enum: ['Unpaid', 'Paid'],
      default: 'Unpaid',
    },

    paymentDetails: {
      senderMobile: { type: String, default: '' },
      transactionId: { type: String, default: '' },
      screenshot: { type: String, default: '' },
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

    codCharge: {
      type: Number,
      default: 0,
    },

    discount: {
      type: Number,
      default: 0,
    },

    couponApplied: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Coupon',
      default: null,
    },

    couponDiscount: {
      type: Number,
      default: 0,
    },

    referralUsed: {
      type: String,
      default: '',
    },

    referralDiscount: {
      type: Number,
      default: 0,
    },

    referralCommission: {
      type: Number,
      default: 0,
    },

    referralCommissionStatus: {
      type: String,
      enum: ['Pending', 'Earned', 'Cancelled'],
      default: 'Pending',
    },

    referralOwner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },

    landedCostTotal: {
      type: Number,
      default: 0,
    },

    isGift: {
      type: Boolean,
      default: false,
    },

    giftDetails: {
      receiverName: { type: String, default: '' },
      phone: { type: String, default: '' },
      address: { type: String, default: '' },
      reason: { type: String, default: '' },
      packagingCost: { type: Number, default: 0 },
      otherExpense: { type: Number, default: 0 },
    },

    // 7 STATUS SYSTEM
    status: {
      type: String,
      enum: [
        'Pending',
        'Confirmed',
        'Delivered',
        'Returned',
        'Exchange',
        'Cancelled',
        'Refunded',
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

    receivedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },

    salesChannel: {
      type: String,
      enum: ['Online', 'Facebook', 'Offline'],
      default: 'Online',
    },

    isModeratorOrder: {
      type: Boolean,
      default: false,
    },

    moderatorUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },

    moderatorProfitTotal: {
      type: Number,
      default: 0,
    },
    moderatorProfitStatus: {
      type: String,
      enum: ['Pending', 'Earned', 'Cancelled'],
      default: 'Pending',
    },
  },

  {
    timestamps: true,
  },
);

module.exports = mongoose.model('Order', orderSchema);
