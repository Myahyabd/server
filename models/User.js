const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },

  phone: {
    type: String,
    required: true,
    unique: true,
  },

  password: {
    type: String,
    required: true,
  },

  role: {
    type: String,
    enum: ['admin', 'moderator', 'customer'],
    default: 'customer',
  },

  referralCode: {
    type: String,
    unique: true,
    sparse: true,
    uppercase: true,
  },

  facebookLink: {
    type: String,
    default: '',
  },

  address: {
    type: String,
    default: '',
  },

  thana: {
    type: String,
    default: '',
  },

  district: {
    type: String,
    default: '',
  },

  notes: {
    type: String,
    default: '',
  },

  otp: {
    type: String,
    default: null,
  },

  otpExpires: {
    type: Date,
    default: null,
  },

  isVerified: {
    type: Boolean,
    default: false,
  },
});

module.exports = mongoose.model('User', userSchema);