const mongoose = require('mongoose');

const buttonSchema = new mongoose.Schema({
  text: { type: String, default: 'Shop Now' },
  link: { type: String, default: '/shop' },
  openNewTab: { type: Boolean, default: false },
  styleType: { type: String, enum: ['filled', 'outline'], default: 'filled' },
  color: { type: String, default: '#143D60' },
  rounded: { type: Boolean, default: true },
  iconName: { type: String, default: '' }
});

const slideSchema = new mongoose.Schema({
  badgeText: { type: String, default: '' },
  title: { type: String, default: 'Welcome to Nus Haat' },
  highlightWord: { type: String, default: '' },
  description: { type: String, default: '' },
  backgroundImage: { type: String, default: '' },
  backgroundPosition: { type: String, default: 'center' },
  backgroundSize: { type: String, default: 'cover' },
  backgroundRepeat: { type: String, default: 'no-repeat' },
  backgroundAttachment: { type: String, default: 'scroll' },
  overlayColor: { type: String, default: 'rgba(0,0,0,0.4)' },
  overlayOpacity: { type: Number, default: 40 },
  overlayGradientColor1: { type: String, default: '' },
  overlayGradientColor2: { type: String, default: '' },
  overlayGradientDirection: { type: String, default: 'to bottom' },
  blurEffect: { type: Number, default: 0 },
  alignment: { type: String, enum: ['left', 'center', 'right'], default: 'center' },
  verticalAlignment: { type: String, enum: ['top', 'center', 'bottom'], default: 'center' },
  heightType: { type: String, enum: ['small', 'medium', 'large', 'vh', 'custom'], default: 'medium' },
  customHeight: { type: Number, default: 500 },
  animationType: { type: String, enum: ['fade', 'slide', 'zoom', 'none'], default: 'fade' },
  enableFloating: { type: Boolean, default: false },
  enableParallax: { type: Boolean, default: false },
  buttons: [buttonSchema]
});

const trustBadgeSchema = new mongoose.Schema({
  title: { type: String, default: '' },
  subtitle: { type: String, default: '' },
  iconName: { type: String, default: '' },
  enabled: { type: Boolean, default: true }
});

const homeSettingsSchema = mongoose.Schema(
  {
    // Keep legacy single-hero settings for absolute backwards-compatibility
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
    categoryImages: [
      {
        categoryName: {
          type: String,
          required: true,
        },
        imageUrl: {
          type: String,
          required: true,
        },
      },
    ],

    // Redesigned Dynamic Slider & Content Section Config
    heroSlides: {
      type: [slideSchema],
      default: []
    },
    showSearchBox: {
      type: Boolean,
      default: false,
    },
    showStatistics: {
      type: Boolean,
      default: false,
    },
    showTrustBadges: {
      type: Boolean,
      default: true,
    },
    statistics: {
      products: { type: Number, default: 120 },
      customers: { type: Number, default: 850 },
      orders: { type: Number, default: 1500 },
      categories: { type: Number, default: 12 }
    },
    trustBadges: {
      type: [trustBadgeSchema],
      default: [
        { title: 'Trusted Store', subtitle: '100% Halal Certified', iconName: 'FaShieldAlt', enabled: true },
        { title: 'Secure Shopping', subtitle: 'SSL Secure Payments', iconName: 'FaLock', enabled: true },
        { title: 'Fast Delivery', subtitle: 'Nationwide Courier', iconName: 'FaTruck', enabled: true },
        { title: 'Quality Products', subtitle: 'Pure & Premium Items', iconName: 'FaStar', enabled: true },
        { title: 'Customer Support', subtitle: 'Dedicated Assistance', iconName: 'FaHeadset', enabled: true }
      ]
    }
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('HomeSettings', homeSettingsSchema);
