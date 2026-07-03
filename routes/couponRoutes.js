const express = require('express');
const router = express.Router();
const Coupon = require('../models/Coupon');
const User = require('../models/User');
const Order = require('../models/Order');
const SystemSettings = require('../models/SystemSettings');
const protect = require('../middleware/authMiddleware');
const { adminOnly } = require('../middleware/roleMiddleware');

// GET ALL COUPONS (Admin Only)
router.get('/', protect, adminOnly, async (req, res) => {
  try {
    const coupons = await Coupon.find().sort({ createdAt: -1 });
    res.json(coupons);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// CREATE COUPON (Admin Only)
router.post('/', protect, adminOnly, async (req, res) => {
  try {
    const { code, discountType, value, minOrder, maxDiscount, usageLimit, expiryDate } = req.body;
    
    if (!code || !discountType || value === undefined) {
      return res.status(400).json({ message: 'Code, discount type, and value are required' });
    }

    const existing = await Coupon.findOne({ code: code.toUpperCase() });
    if (existing) {
      return res.status(400).json({ message: 'Coupon code already exists' });
    }

    const coupon = await Coupon.create({
      code: code.toUpperCase(),
      discountType,
      value: Number(value),
      minOrder: Number(minOrder || 0),
      maxDiscount: maxDiscount ? Number(maxDiscount) : null,
      usageLimit: usageLimit ? Number(usageLimit) : null,
      expiryDate: expiryDate ? new Date(expiryDate) : null,
    });

    res.status(201).json(coupon);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE COUPON (Admin Only)
router.delete('/:id', protect, adminOnly, async (req, res) => {
  try {
    const coupon = await Coupon.findById(req.params.id);
    if (!coupon) return res.status(404).json({ message: 'Coupon not found' });
    
    await coupon.deleteOne();
    res.json({ message: 'Coupon deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// VALIDATE COUPON (Public / Customer)
router.post('/validate', protect, async (req, res) => {
  try {
    const { code, orderAmount } = req.body;
    if (!code) return res.status(400).json({ message: 'Coupon code is required' });

    let coupon = await Coupon.findOne({ code: code.toUpperCase(), status: 'Active' });
    if (!coupon) {
      // Check if it matches a staff referral code
      const staffUser = await User.findOne({ referralCode: code.toUpperCase() });
      if (staffUser && ['admin', 'moderator'].includes(staffUser.role)) {
        
        // User cannot use their own referral code
        if (staffUser._id.toString() === req.user.id.toString()) {
          return res.status(400).json({ message: 'You cannot use your own referral code' });
        }

        // Fetch settings
        const settings = await SystemSettings.findOne();
        const refSettings = settings?.referralSettings;
        if (!refSettings || !refSettings.enabled) {
          return res.status(400).json({ message: 'Referral discount system is currently disabled' });
        }

        // Expiry check
        if (refSettings.expiryDate && new Date() > refSettings.expiryDate) {
          return res.status(400).json({ message: 'Referral code has expired' });
        }

        // Usage limit check
        if (refSettings.usageLimit !== null && refSettings.usageLimit > 0) {
          const usedCount = await Order.countDocuments({ referralUsed: code.toUpperCase(), status: { $ne: 'Cancelled' } });
          if (usedCount >= refSettings.usageLimit) {
            return res.status(400).json({ message: 'Referral code usage limit reached' });
          }
        }

        // Min Order Amount check
        const amount = Number(orderAmount || 0);
        if (amount < refSettings.minOrder) {
          return res.status(400).json({ message: `Minimum order amount of ৳${refSettings.minOrder} is required` });
        }

        // Calculate Discount
        let discount = 0;
        if (refSettings.discountType === 'Percentage') {
          discount = (refSettings.value / 100) * amount;
          if (refSettings.maxDiscount !== null && discount > refSettings.maxDiscount) {
            discount = refSettings.maxDiscount;
          }
        } else {
          discount = refSettings.value;
        }

        // Discount cannot exceed order amount
        if (discount > amount) {
          discount = amount;
        }

        return res.json({
          message: 'Referral code applied successfully!',
          isReferral: true,
          code: staffUser.referralCode,
          discountType: refSettings.discountType,
          value: refSettings.value,
          discountAmount: discount
        });
      }

      return res.status(404).json({ message: 'Invalid or inactive coupon or referral code' });
    }

    // Expiry Check
    if (coupon.expiryDate && new Date() > coupon.expiryDate) {
      return res.status(400).json({ message: 'Coupon has expired' });
    }

    // Usage Limit Check
    if (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit) {
      return res.status(400).json({ message: 'Coupon usage limit reached' });
    }

    // Min Order Check
    const amount = Number(orderAmount || 0);
    if (amount < coupon.minOrder) {
      return res.status(400).json({ message: `Minimum order amount of ৳${coupon.minOrder} is required` });
    }

    // Calculate Discount
    let discount = 0;
    if (coupon.discountType === 'Percentage') {
      discount = (coupon.value / 100) * amount;
      if (coupon.maxDiscount !== null && discount > coupon.maxDiscount) {
        discount = coupon.maxDiscount;
      }
    } else {
      discount = coupon.value;
    }

    // Discount cannot exceed order amount
    if (discount > amount) {
      discount = amount;
    }

    res.json({
      message: 'Coupon is valid',
      code: coupon.code,
      discountType: coupon.discountType,
      value: coupon.value,
      discountAmount: discount
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
