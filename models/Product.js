const mongoose = require('mongoose');

// REVIEW SCHEMA
const reviewSchema = mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },

    name: {
      type: String,
    },

    rating: {
      type: Number,
      required: true,
    },

    comment: {
      type: String,
    },
  },
  {
    timestamps: true,
  },
);

// VARIANT SCHEMA
const variantSchema = mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },

    price: {
      type: Number,
      required: true,
    },

    stock: {
      type: Number,
      default: 0,
    },

    image: {
      type: String,
      default: null,
    },
  },
  {
    _id: false,
  },
);

// PRODUCT SCHEMA
const productSchema = mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },

    images: [
      {
        type: String,
      },
    ],

    // BASE PRICE
    price: {
      type: Number,
      required: true,
    },

    salePrice: {
      type: Number,
    },

    moderatorPrice: {
      type: Number,
    },

    shortDesc: {
      type: String,
    },

    fullDesc: {
      type: String,
    },

    category: {
      type: String,
    },

    stock: {
      type: Number,
      default: 0,
    },

    // ===== VARIANTS =====
    hasVariants: {
      type: Boolean,
      default: false,
    },

    variants: [variantSchema],

    // ===== REVIEWS =====
    reviews: [reviewSchema],

    numReviews: {
      type: Number,
      default: 0,
    },

    rating: {
      type: Number,
      default: 0,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model('Product', productSchema);
