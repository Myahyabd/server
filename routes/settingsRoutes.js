const express = require('express');
const router = express.Router();
const SystemSettings = require('../models/SystemSettings');
const User = require('../models/User');
const protect = require('../middleware/authMiddleware');
const { adminOnly } = require('../middleware/roleMiddleware');

// GET SYSTEM SETTINGS (Public/Authed)
router.get('/', protect.optionalProtect || protect, async (req, res) => {
  try {
    let settings = await SystemSettings.findOne();
    if (!settings) {
      // Create default settings if none exists
      settings = await SystemSettings.create({
        deliverySettings: {
          type: 'Fixed',
          fixedCharge: 80,
          districtCharges: [],
          courierCharges: [],
          freeDeliveryEnabled: false,
          freeDeliveryMinAmount: 1000,
          freeDeliveryProducts: [],
          freeDeliveryCategories: [],
        },
        codSettings: {
          enabled: true,
          chargeType: 'Percentage',
          value: 1,
        },
        referralSettings: {
          enabled: true,
          discountType: 'Percentage',
          value: 5,
          minOrder: 0,
          maxDiscount: 200,
        },
        paymentMethods: [
          { name: 'COD', enabled: true, instructions: 'Pay cash when you receive the package.' },
          { name: 'bKash', enabled: true, instructions: 'Send money to our bKash personal number.', accountNumber: '01700000000' },
          { name: 'Nagad', enabled: true, instructions: 'Send money to our Nagad personal number.', accountNumber: '01700000000' },
        ],
      });
    }
    res.json(settings);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// UPDATE SYSTEM SETTINGS (Admin Only)
router.put('/', protect, adminOnly, async (req, res) => {
  try {
    let settings = await SystemSettings.findOne();
    if (!settings) {
      settings = new SystemSettings(req.body);
    } else {
      settings.deliverySettings = req.body.deliverySettings || settings.deliverySettings;
      settings.codSettings = req.body.codSettings || settings.codSettings;
      settings.referralSettings = req.body.referralSettings || settings.referralSettings;
      settings.paymentMethods = req.body.paymentMethods || settings.paymentMethods;
    }
    await settings.save();
    res.json(settings);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// VALIDATE REFERRAL CODE (Public/Customer checkout)
router.post('/referral/validate', protect, async (req, res) => {
  try {
    const { code, orderAmount } = req.body;
    if (!code) return res.status(400).json({ message: 'Referral code is required' });

    // Find moderator with this referral code
    const moderator = await User.findOne({
      referralCode: code.toUpperCase(),
      role: { $in: ['admin', 'moderator'] },
    });

    if (!moderator) {
      return res.status(404).json({ message: 'Invalid referral code' });
    }

    const settings = await SystemSettings.findOne();
    const refConfig = settings?.referralSettings;

    if (!refConfig || !refConfig.enabled) {
      return res.status(400).json({ message: 'Referral system is currently disabled' });
    }

    const amount = Number(orderAmount || 0);
    if (amount < refConfig.minOrder) {
      return res.status(400).json({ message: `Minimum order amount of ৳${refConfig.minOrder} is required for referral discount` });
    }

    // Calculate discount
    let discount = 0;
    if (refConfig.discountType === 'Percentage') {
      discount = (refConfig.value / 100) * amount;
      if (refConfig.maxDiscount !== null && discount > refConfig.maxDiscount) {
        discount = refConfig.maxDiscount;
      }
    } else {
      discount = refConfig.value;
    }

    if (discount > amount) discount = amount;

    res.json({
      message: 'Referral code is valid',
      moderatorName: moderator.name,
      discountAmount: discount,
      code: moderator.referralCode
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
