const mongoose = require('mongoose');

const homeSettingsSchema = mongoose.Schema(
  {
    heroImage: {
      type: String,
      default: 'https://placehold.co/1200x600?text=Welcome+to+Nus+Haat',
    },
    heroTitle: {
      type: String,
      default: 'Welcome To Nus Haat',
    },
    heroSubtitle: {
      type: String,
      default: 'Your Trusted Halal Lifestyle Store',
    },
    heroDescription: {
      type: String,
      default: 'Premium Islamic products, Attar, Body Care, Gifts and Everyday Essentials for Muslim Families.',
    },
    heroButtonText: {
      type: String,
      default: 'Shop Now',
    },
    heroButtonLink: {
      type: String,
      default: '/shop',
    },
    bannerImage: {
      type: String,
      default: '',
    },
    bannerLink: {
      type: String,
      default: '/shop',
    },
    showBanner: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('HomeSettings', homeSettingsSchema);
