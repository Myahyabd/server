const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Product = require('../models/Product');
const Order = require('../models/Order');
const AffiliateClick = require('../models/AffiliateClick');
const WithdrawalRequest = require('../models/WithdrawalRequest');
const WalletTransaction = require('../models/WalletTransaction');
const SystemSettings = require('../models/SystemSettings');
const protect = require('../middleware/authMiddleware');
const { adminOnly, adminOrModerator } = require('../middleware/roleMiddleware');

// 1. APPLY / REGISTER TO BE AN AFFILIATE (Authed Customers)
router.post('/register', protect, async (req, res) => {
  try {
    const { address, facebookLink } = req.body;
    if (!address || !address.trim()) {
      return res.status(400).json({ message: 'Address is required.' });
    }

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (user.affiliateStatus === 'approved') {
      return res.status(400).json({ message: 'You are already an approved affiliate.' });
    }
    if (user.affiliateStatus === 'pending') {
      return res.status(400).json({ message: 'Your affiliate application is already pending approval.' });
    }

    user.affiliateStatus = 'pending';
    user.affiliateAddress = address;
    user.affiliateFacebookLink = facebookLink || '';
    user.affiliateRegisteredAt = new Date();
    await user.save();

    res.json({ message: 'Affiliate application submitted successfully. Pending admin review.' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// 2. GET AFFILIATE DASHBOARD STATS (Authed Affiliates Only)
router.get('/dashboard-stats', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user || user.affiliateStatus !== 'approved') {
      return res.status(403).json({ message: 'Access denied. Affiliate status not approved.' });
    }

    const settings = await SystemSettings.findOne();
    const globalCommissionType = settings?.affiliateSettings?.commissionType || 'Percentage';
    const globalCommissionValue = settings?.affiliateSettings?.value || 10;

    // 1. Total Clicks
    const clickCount = await AffiliateClick.countDocuments({ affiliate: user._id });

    // 2. Link Counts (Distinct products clicked)
    const uniqueLinkCount = (await AffiliateClick.distinct('product', { affiliate: user._id })).length;

    // 3. Orders stats
    const orders = await Order.find({ affiliateUser: user._id });
    const totalOrders = orders.length;
    const successfulOrders = orders.filter(o => o.status === 'Delivered').length;

    const pendingCommission = orders
      .filter(o => o.affiliateCommissionStatus === 'Pending')
      .reduce((sum, o) => sum + (o.affiliateCommission || 0), 0);

    const approvedCommission = orders
      .filter(o => o.affiliateCommissionStatus === 'Earned')
      .reduce((sum, o) => sum + (o.affiliateCommission || 0), 0);

    // 4. Withdrawal stats
    const approvedWithdrawals = await WithdrawalRequest.find({ user: user._id, status: 'Approved' });
    const withdrawnAmount = approvedWithdrawals.reduce((sum, w) => sum + w.amount, 0);

    // Available Balance
    const availableBalance = user.wallet?.availableBalance || 0;

    res.json({
      clickCount,
      uniqueLinkCount,
      totalOrders,
      successfulOrders,
      pendingCommission,
      approvedCommission,
      withdrawnAmount,
      availableBalance,
      globalCommissionType,
      globalCommissionValue
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// 3. LOG INBOUND CLICK (Public)
router.post('/click', async (req, res) => {
  try {
    const { affiliateId, productId, referralSource } = req.body;
    if (!affiliateId || !productId) {
      return res.status(400).json({ message: 'Affiliate ID and Product ID are required.' });
    }

    // Validate affiliate status
    const affiliate = await User.findById(affiliateId);
    if (!affiliate || affiliate.affiliateStatus !== 'approved') {
      return res.status(400).json({ message: 'Invalid or inactive affiliate account.' });
    }

    // Prevent duplicate spam clicking (Same IP, same product, same affiliate in last 15 minutes)
    const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000);
    const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
    
    const recentClick = await AffiliateClick.findOne({
      affiliate: affiliateId,
      product: productId,
      ip,
      createdAt: { $gte: fifteenMinAgo }
    });

    if (recentClick) {
      // Ignore click without throwing an error to prevent script blocking
      return res.json({ message: 'Click tracked (cache bypassed for duplicate click prevention).' });
    }

    // Simple user-agent parsing
    const userAgent = req.headers['user-agent'] || '';
    let browser = 'Unknown Browser';
    let device = 'Desktop';

    if (/chrome|crios/i.test(userAgent)) browser = 'Chrome';
    else if (/firefox|fxios/i.test(userAgent)) browser = 'Firefox';
    else if (/safari/i.test(userAgent)) browser = 'Safari';
    else if (/opr\//i.test(userAgent)) browser = 'Opera';
    else if (/edg/i.test(userAgent)) browser = 'Edge';

    if (/mobile|android|iphone|ipad/i.test(userAgent)) {
      device = 'Mobile';
    }

    await AffiliateClick.create({
      affiliate: affiliateId,
      product: productId,
      ip,
      device,
      browser,
      referralSource: referralSource || 'Direct'
    });

    res.json({ message: 'Click tracked successfully.' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// 4. REQUEST WITHDRAWAL (Authed Affiliates Only)
router.post('/withdraw', protect, async (req, res) => {
  try {
    const { amount, paymentMethod, accountNumber, accountName, note } = req.body;
    if (!amount || !paymentMethod || !accountNumber) {
      return res.status(400).json({ message: 'Amount, Payment Method and Account Number are required.' });
    }

    const withdrawVal = Number(amount);
    if (withdrawVal <= 0) return res.status(400).json({ message: 'Withdrawal amount must be greater than zero.' });

    const user = await User.findById(req.user.id);
    if (!user || user.affiliateStatus !== 'approved') {
      return res.status(403).json({ message: 'Access denied. Affiliate status not approved.' });
    }

    // Check pending withdrawals + current available balance
    const pendingRequests = await WithdrawalRequest.find({ user: user._id, status: 'Pending' });
    const pendingSum = pendingRequests.reduce((sum, w) => sum + w.amount, 0);

    const availableBalance = user.wallet?.availableBalance || 0;
    if (availableBalance - pendingSum < withdrawVal) {
      return res.status(400).json({
        message: `Sufficient funds unavailable. Available Balance: ৳${availableBalance - pendingSum}`
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

    // Create Wallet Transaction
    await WalletTransaction.create({
      user: user._id,
      type: 'Withdrawal_Request',
      amount: withdrawVal,
      balanceAfter: availableBalance, // Unchanged until approval
      status: 'Pending',
      note: `Affiliate payout request of ৳${withdrawVal} via ${paymentMethod} (${accountNumber})`
    });

    res.status(201).json({ message: 'Withdrawal request submitted successfully.', request });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// 5. GET WITHDRAWAL HISTORY (Authed Affiliates Only)
router.get('/withdrawals', protect, async (req, res) => {
  try {
    const requests = await WithdrawalRequest.find({ user: req.user.id }).sort({ createdAt: -1 });
    res.json(requests);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// 6. GET COMMISSION ORDERS (Authed Affiliates Only)
router.get('/commissions', protect, async (req, res) => {
  try {
    const orders = await Order.find({ affiliateUser: req.user.id })
      .populate('orderItems.product', 'name images')
      .sort({ createdAt: -1 });
    res.json(orders);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// 7. GET CLICK HISTORY LOGS (Authed Affiliates Only)
router.get('/clicks', protect, async (req, res) => {
  try {
    const clicks = await AffiliateClick.find({ affiliate: req.user.id })
      .populate('product', 'name images price')
      .sort({ createdAt: -1 });
    res.json(clicks);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ==========================================
// ADMIN & MODERATOR API ROUTINGS
// ==========================================

// 8. GET ALL AFFILIATE APPLICATIONS (Admin/Moderator Only)
router.get('/admin/applications', protect, adminOrModerator, async (req, res) => {
  try {
    const affiliates = await User.find({ affiliateStatus: { $ne: 'none' } })
      .select('name email phone affiliateStatus affiliateRegisteredAt wallet affiliateAddress affiliateFacebookLink')
      .sort({ affiliateRegisteredAt: -1 });
    res.json(affiliates);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// 9. UPDATE AFFILIATE APPLICATION STATUS (Admin/Moderator Only)
router.put('/admin/applications/:id', protect, adminOrModerator, async (req, res) => {
  try {
    const { status } = req.body;
    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status. Choose approved or rejected.' });
    }

    const affiliate = await User.findById(req.params.id);
    if (!affiliate) return res.status(404).json({ message: 'User not found.' });

    affiliate.affiliateStatus = status;
    await affiliate.save();

    res.json({ message: `Affiliate application status updated to ${status}.`, affiliate });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// 10. GET ALL CLICK LOGS FOR SYSTEM (Admin Only)
router.get('/admin/clicks', protect, adminOnly, async (req, res) => {
  try {
    const clicks = await AffiliateClick.find()
      .populate('affiliate', 'name email phone')
      .populate('product', 'name price')
      .sort({ createdAt: -1 });
    res.json(clicks);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// 11. GET ALL WITHDRAWAL REQUESTS (Admin Only)
router.get('/admin/withdrawals', protect, adminOnly, async (req, res) => {
  try {
    const requests = await WithdrawalRequest.find()
      .populate('user', 'name email phone')
      .sort({ createdAt: -1 });
    res.json(requests);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// 12. APPROVE / REJECT WITHDRAWAL (Admin Only)
router.put('/admin/withdrawals/:id', protect, adminOnly, async (req, res) => {
  try {
    const { status, adminNote } = req.body;
    if (!['Approved', 'Rejected'].includes(status)) {
      return res.status(400).json({ message: 'Status must be Approved or Rejected.' });
    }

    const request = await WithdrawalRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ message: 'Withdrawal request not found.' });

    if (request.status !== 'Pending') {
      return res.status(400).json({ message: 'Withdrawal request has already been processed.' });
    }

    const user = await User.findById(request.user);
    if (!user) return res.status(404).json({ message: 'User account not found.' });

    if (status === 'Approved') {
      const balance = user.wallet?.availableBalance || 0;
      if (balance < request.amount) {
        return res.status(400).json({ message: 'Affiliate available balance is insufficient.' });
      }

      user.wallet.availableBalance -= request.amount;
      user.wallet.paidCommission = (user.wallet.paidCommission || 0) + request.amount;
      await user.save();

      request.status = 'Approved';
      request.adminNote = adminNote || '';
      request.transactionId = adminNote || 'Paid';
      request.approvedAt = new Date();
      await request.save();

      // Log successful transaction
      await WalletTransaction.create({
        user: user._id,
        type: 'Withdrawal_Approved',
        amount: -request.amount,
        balanceAfter: user.wallet.availableBalance,
        status: 'Completed',
        note: `Affiliate payout request approved. Method: ${request.paymentMethod}. ${adminNote || ''}`
      });

      // Update matching pending transaction
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
        amount: 0,
        balanceAfter: user.wallet?.availableBalance || 0,
        status: 'Rejected',
        note: `Affiliate payout request rejected. Reason: ${adminNote || ''}`
      });

      // Update matching pending transaction to Cancelled
      await WalletTransaction.findOneAndUpdate(
        { user: user._id, type: 'Withdrawal_Request', amount: request.amount, status: 'Pending' },
        { status: 'Cancelled' }
      );
    }

    res.json({ message: `Withdrawal request successfully ${status}.`, request });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// 13. GET ANALYTICAL REPORTS (Admin Only)
router.get('/admin/reports', protect, adminOnly, async (req, res) => {
  try {
    // A. Top Affiliates by approved earnings
    const topAffiliates = await User.find({ affiliateStatus: 'approved' })
      .select('name email phone wallet')
      .sort({ 'wallet.paidCommission': -1 })
      .limit(10);

    // B. Conversions summary (Clicks vs Converted)
    const totalClicks = await AffiliateClick.countDocuments();
    const totalConversions = await AffiliateClick.countDocuments({ isConverted: true });

    // C. Top Selling Products via affiliate
    const affiliateOrders = await Order.find({ isAffiliateOrder: true, status: 'Delivered' });
    const productSalesMap = {};

    affiliateOrders.forEach(order => {
      order.orderItems.forEach(item => {
        const prodId = item.product.toString();
        if (!productSalesMap[prodId]) {
          productSalesMap[prodId] = {
            name: item.name,
            qty: 0,
            revenue: 0
          };
        }
        productSalesMap[prodId].qty += item.qty;
        productSalesMap[prodId].revenue += item.price * item.qty;
      });
    });

    const topSellingProducts = Object.values(productSalesMap)
      .sort((a, b) => b.qty - a.qty)
      .limit(10);

    res.json({
      topAffiliates,
      conversionSummary: {
        totalClicks,
        totalConversions,
        conversionRate: totalClicks > 0 ? ((totalConversions / totalClicks) * 100).toFixed(2) : 0
      },
      topSellingProducts
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// 14. SET PRODUCT OVERRIDE COMMISSION (Admin Only)
router.put('/admin/commission-override', protect, adminOnly, async (req, res) => {
  try {
    const { productId, affiliateCommissionType, affiliateCommissionValue } = req.body;
    if (!productId || !affiliateCommissionType) {
      return res.status(400).json({ message: 'Product ID and Commission Type are required.' });
    }

    const product = await Product.findById(productId);
    if (!product) return res.status(404).json({ message: 'Product not found.' });

    product.affiliateCommissionType = affiliateCommissionType;
    product.affiliateCommissionValue = Number(affiliateCommissionValue || 0);
    await product.save();

    res.json({ message: 'Product affiliate commission override saved successfully.', product });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
