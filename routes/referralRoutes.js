const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Order = require('../models/Order');
const SystemSettings = require('../models/SystemSettings');
const WithdrawalRequest = require('../models/WithdrawalRequest');
const WalletTransaction = require('../models/WalletTransaction');
const protect = require('../middleware/authMiddleware');
const { adminOnly, adminOrModerator, resellerOrStaff } = require('../middleware/roleMiddleware');

// 1. GET REFERRAL SETTINGS (Public/Staff)
router.get('/settings', async (req, res) => {
  try {
    let settings = await SystemSettings.findOne();
    if (!settings) {
      settings = await SystemSettings.create({});
    }
    res.json(settings.referralSettings || {});
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// 2. UPDATE REFERRAL SETTINGS (Admin Only)
router.put('/settings', protect, adminOnly, async (req, res) => {
  try {
    const { enabled, discountType, value, minOrder, maxDiscount, expiryDate, usageLimit, commissionType, commissionValue } = req.body;

    let settings = await SystemSettings.findOne();
    if (!settings) {
      settings = new SystemSettings({});
    }

    settings.referralSettings = {
      enabled: enabled !== undefined ? enabled : settings.referralSettings.enabled,
      discountType: discountType || settings.referralSettings.discountType,
      value: value !== undefined ? Number(value) : settings.referralSettings.value,
      minOrder: minOrder !== undefined ? Number(minOrder) : settings.referralSettings.minOrder,
      maxDiscount: maxDiscount !== undefined ? Number(maxDiscount) : settings.referralSettings.maxDiscount,
      expiryDate: expiryDate ? new Date(expiryDate) : null,
      usageLimit: usageLimit !== undefined ? Number(usageLimit) : null,
      commissionType: commissionType || settings.referralSettings.commissionType,
      commissionValue: commissionValue !== undefined ? Number(commissionValue) : settings.referralSettings.commissionValue,
    };

    await settings.save();
    res.json(settings.referralSettings);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// 3. GET WALLET DETAILS & TRANSACTIONS (Reseller/Moderator/Admin Only)
router.get('/wallet', protect, resellerOrStaff, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Generate referralCode on-the-fly for existing users if missing
    if (!user.referralCode) {
      let code = '';
      let exists = true;
      while (exists) {
        const suffix = Math.floor(100000 + Math.random() * 900000);
        code = `NUS-${suffix}`;
        const duplicate = await User.findOne({ referralCode: code });
        if (!duplicate) exists = false;
      }
      user.referralCode = code;
      await user.save();
    }

    // Calculate active pending withdrawals to prevent double-spending
    const pendingWithdrawals = await WithdrawalRequest.find({ user: user._id, status: 'Pending' });
    const pendingWithdrawalSum = pendingWithdrawals.reduce((sum, req) => sum + req.amount, 0);

    const transactions = await WalletTransaction.find({ user: user._id })
      .populate('order', 'totalPrice status createdAt')
      .sort({ createdAt: -1 });

    const totalReferredUsers = user.referralCode ? await User.countDocuments({ referredBy: user.referralCode }) : 0;

    res.json({
      referralCode: user.referralCode,
      totalReferredUsers,
      wallet: user.wallet || {
        availableBalance: 0,
        pendingCommission: 0,
        paidCommission: 0,
        totalReferralOrders: 0,
        totalSalesGenerated: 0,
        totalDiscountGiven: 0
      },
      pendingWithdrawalSum,
      transactions
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// 3b. GET MY WITHDRAWAL REQUESTS (Reseller/Moderator/Admin Only)
router.get('/my-withdrawals', protect, resellerOrStaff, async (req, res) => {
  try {
    const requests = await WithdrawalRequest.find({ user: req.user.id }).sort({ createdAt: -1 });
    res.json(requests);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// 4. REQUEST WITHDRAWAL (Reseller/Moderator/Admin Only)
router.post('/withdraw', protect, resellerOrStaff, async (req, res) => {
  try {
    const { amount, paymentMethod, accountNumber, accountName, note } = req.body;

    if (!amount || !paymentMethod || !accountNumber || !accountName) {
      return res.status(400).json({ message: 'Amount, payment method, account name, and account number are required' });
    }

    const withdrawVal = Number(amount);
    if (withdrawVal <= 0) {
      return res.status(400).json({ message: 'Amount must be positive' });
    }

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Fetch active pending requests to ensure sufficient balance
    const pendingRequests = await WithdrawalRequest.find({ user: user._id, status: 'Pending' });
    const pendingSum = pendingRequests.reduce((sum, req) => sum + req.amount, 0);

    const currentWalletBalance = user.wallet?.availableBalance || 0;
    if (currentWalletBalance - pendingSum < withdrawVal) {
      return res.status(400).json({
        message: `Sufficient funds unavailable. Available: ৳${currentWalletBalance - pendingSum}`
      });
    }

    const request = await WithdrawalRequest.create({
      user: user._id,
      amount: withdrawVal,
      paymentMethod,
      accountNumber,
      accountName: accountName || '',
      note: note || '',
      status: 'Pending'
    });

    // Log the transaction request as pending
    await WalletTransaction.create({
      user: user._id,
      type: 'Withdrawal_Request',
      amount: withdrawVal,
      balanceAfter: currentWalletBalance, // remains unchanged until approval
      status: 'Pending',
      note: `Payout request of ৳${withdrawVal} via ${paymentMethod} (${accountNumber})`,
      method: `${paymentMethod} (${accountNumber})`
    });

    res.status(201).json(request);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// 5. GET ALL WITHDRAWAL REQUESTS (Admin Only)
router.get('/admin/withdrawals', protect, adminOnly, async (req, res) => {
  try {
    const requests = await WithdrawalRequest.find()
      .populate('user', 'name referralCode email phone')
      .sort({ createdAt: -1 });
    res.json(requests);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// 6. APPROVE/REJECT WITHDRAWAL REQUEST (Admin Only)
router.put('/admin/withdrawals/:id', protect, adminOnly, async (req, res) => {
  try {
    const { status, adminNote } = req.body;
    if (!['Approved', 'Rejected'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status type' });
    }

    const request = await WithdrawalRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ message: 'Withdrawal request not found' });

    if (request.status !== 'Pending') {
      return res.status(400).json({ message: 'Request has already been processed' });
    }

    const user = await User.findById(request.user);
    if (!user) return res.status(404).json({ message: 'User owner not found' });

    if (status === 'Approved') {
      const balance = user.wallet?.availableBalance || 0;
      if (balance < request.amount) {
        return res.status(400).json({ message: 'User wallet balance is insufficient for approval' });
      }

      user.wallet.availableBalance -= request.amount;
      user.wallet.paidCommission = (user.wallet.paidCommission || 0) + request.amount;
      await user.save();

      request.status = 'Approved';
      request.adminNote = adminNote || '';
      request.transactionId = adminNote || 'N/A';
      request.approvedAt = new Date();
      await request.save();

      // Log successful transaction
      await WalletTransaction.create({
        user: user._id,
        type: 'Withdrawal_Approved',
        amount: -request.amount,
        balanceAfter: user.wallet.availableBalance,
        status: 'Completed',
        note: `Payout request approved. Method: ${request.paymentMethod}. ${adminNote || ''}`
      });

      // Update matching pending transaction status log to Completed
      await WalletTransaction.findOneAndUpdate(
        { user: user._id, type: 'Withdrawal_Request', amount: request.amount, status: 'Pending' },
        { status: 'Completed' }
      );
    } else {
      request.status = 'Rejected';
      request.adminNote = adminNote || '';
      request.rejectedAt = new Date();
      await request.save();

      // Log rejected transaction
      await WalletTransaction.create({
        user: user._id,
        type: 'Withdrawal_Rejected',
        amount: request.amount,
        balanceAfter: user.wallet?.availableBalance || 0,
        status: 'Completed',
        note: `Payout request rejected. ${adminNote || ''}`
      });

      // Update matching pending transaction status log to Rejected
      await WalletTransaction.findOneAndUpdate(
        { user: user._id, type: 'Withdrawal_Request', amount: request.amount, status: 'Pending' },
        { status: 'Rejected' }
      );
    }

    res.json(request);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// 7. GET WALLETS/USER REFERRAL CODES LIST (Admin Only)
router.get('/admin/wallets', protect, adminOnly, async (req, res) => {
  try {
    const { all } = req.query;
    let query = { role: { $in: ['admin', 'moderator', 'reseller'] } };
    if (all === 'true') {
      query = {};
    }
    const users = await User.find(query)
      .select('name referralCode role wallet email phone resellerId')
      .sort({ name: 1 });

    const usersWithStats = await Promise.all(
      users.map(async (u) => {
        const totalReferredCount = u.referralCode
          ? await User.countDocuments({ referredBy: u.referralCode })
          : 0;
        return {
          ...u.toObject(),
          totalReferredCount
        };
      })
    );

    res.json(usersWithStats);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// 8. MANUAL WALLET ADJUSTMENT (Admin Only)
router.put('/admin/wallets/:userId/adjust', protect, adminOnly, async (req, res) => {
  try {
    const { type, amount, reason } = req.body;
    if (!['Add', 'Deduct'].includes(type)) {
      return res.status(400).json({ message: 'Adjustment type must be Add or Deduct' });
    }

    if (!amount || Number(amount) <= 0 || !reason) {
      return res.status(400).json({ message: 'Positive amount and adjustment reason are required' });
    }

    const adjustVal = Number(amount);
    const user = await User.findById(req.params.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (!user.wallet) {
      user.wallet = { availableBalance: 0, pendingCommission: 0, paidCommission: 0, totalReferralOrders: 0, totalSalesGenerated: 0, totalDiscountGiven: 0 };
    }

    if (type === 'Add') {
      user.wallet.availableBalance += adjustVal;
    } else {
      if (user.wallet.availableBalance < adjustVal) {
        return res.status(400).json({ message: 'User wallet balance is insufficient' });
      }
      user.wallet.availableBalance -= adjustVal;
    }

    await user.save();

    await WalletTransaction.create({
      user: user._id,
      type: 'Manual_Adjustment',
      amount: type === 'Add' ? adjustVal : -adjustVal,
      balanceAfter: user.wallet.availableBalance,
      status: 'Completed',
      note: `Manual adjustment by Admin. Reason: ${reason}`
    });

    res.json(user.wallet);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
