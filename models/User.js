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

  email: {
    type: String,
    sparse: true,
  },

  password: {
    type: String,
    required: true,
  },

  role: {
    type: String,
    enum: ['admin', 'moderator', 'reseller', 'customer'],
    default: 'customer',
  },

  isModeratorPending: {
    type: Boolean,
    default: false,
  },

  resellerId: {
    type: Number,
    unique: true,
    sparse: true,
  },

  referralCode: {
    type: String,
    unique: true,
    sparse: true,
    uppercase: true,
  },

  referredBy: {
    type: String,
    default: '',
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

  dateOfBirth: {
    type: String,
    default: '',
  },

  resellerRoles: {
    type: [String],
    default: [],
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

  profilePhoto: {
    type: String,
    default: '',
  },

  position: {
    type: String,
    default: '',
  },

  shortBio: {
    type: String,
    default: '',
  },

  fullBio: {
    type: String,
    default: '',
  },

  responsibilities: {
    type: String,
    default: '',
  },

  joinedNusHaat: {
    type: String,
    default: '',
  },

  joiningReason: {
    type: String,
    default: '',
  },

  skills: {
    type: String,
    default: '',
  },

  linkedinLink: {
    type: String,
    default: '',
  },

  githubLink: {
    type: String,
    default: '',
  },

  websiteLink: {
    type: String,
    default: '',
  },
  wallet: {
    availableBalance: { type: Number, default: 0 },
    pendingCommission: { type: Number, default: 0 },
    paidCommission: { type: Number, default: 0 },
    totalReferralOrders: { type: Number, default: 0 },
    totalSalesGenerated: { type: Number, default: 0 },
    totalDiscountGiven: { type: Number, default: 0 }
  }
});

userSchema.pre('save', async function (next) {
  if (!this.referralCode) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let isUnique = false;
    let code = '';
    
    // Safety check to prevent collisions
    while (!isUnique) {
      code = 'NUS-';
      for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      
      const existing = await mongoose.models.User.findOne({ referralCode: code });
      if (!existing) {
        isUnique = true;
      }
    }
    
    this.referralCode = code;
  }

  if (['admin', 'moderator', 'reseller'].includes(this.role)) {
    if (!this.resellerId) {
      let idExists = true;
      let newId;
      while (idExists) {
        newId = Math.floor(1000 + Math.random() * 9000); // 4-digit number
        const duplicate = await mongoose.models.User.findOne({ resellerId: newId });
        if (!duplicate) idExists = false;
      }
      this.resellerId = newId;
    }
    this.referralCode = `RSL${this.resellerId}`;
  }

  if (typeof next === 'function') next();
});

module.exports = mongoose.model('User', userSchema);