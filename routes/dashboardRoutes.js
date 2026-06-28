const express = require('express');

const router = express.Router();

const Order = require('../models/Order');

const Product = require('../models/Product');

const User = require('../models/User');

const protect = require('../middleware/authMiddleware');

const { adminOrModerator } = require('../middleware/roleMiddleware');
const Expense = require('../models/Expense');

// DASHBOARD ANALYTICS
router.get(
  '/analytics',

  protect,
  adminOrModerator,

  async (req, res) => {
    try {
      const isStaff = req.user && (req.user.role === 'admin' || req.user.role === 'moderator');
      if (!isStaff) {
        return res.status(403).json({ message: 'Access denied' });
      }

      if (req.user.role === 'admin') {
        // ADMIN METRICS
        const orders = await Order.find({ status: { $ne: 'Cancelled' } });
        const totalRevenue = orders.reduce((acc, item) => acc + item.totalPrice, 0);
        const totalOrders = await Order.countDocuments();
        const totalProducts = await Product.countDocuments();
        const totalUsers = await User.countDocuments();

        const expenses = await Expense.find();
        const totalExpenses = expenses.reduce((acc, item) => acc + item.amount, 0);
        
        const salaryExpenses = expenses.filter(e => e.category === 'Salary');
        const totalSalaries = salaryExpenses.reduce((acc, item) => acc + item.amount, 0);

        const netBenefit = totalRevenue - totalExpenses;

        const lowStockProducts = await Product.find({ stock: { $lt: 5 } });
        const recentOrders = await Order.find()
          .populate('user', 'name')
          .sort({ createdAt: -1 })
          .limit(5);

        res.json({
          role: 'admin',
          totalRevenue,
          totalOrders,
          totalProducts,
          totalUsers,
          totalExpenses,
          totalSalaries,
          netBenefit,
          lowStockProducts,
          recentOrders,
        });
      } else {
        // MODERATOR METRICS
        // Only orders claimed/received by this moderator
        const myOrders = await Order.find({ receivedBy: req.user.id });
        const myActiveOrders = myOrders.filter(o => o.status !== 'Cancelled');
        const totalRevenue = myActiveOrders.reduce((acc, item) => acc + item.totalPrice, 0);
        const totalOrders = myOrders.length;

        // Moderator's own expenses
        const myExpensesList = await Expense.find({ user: req.user.id });
        const totalExpenses = myExpensesList.reduce((acc, item) => acc + item.amount, 0);

        const totalProducts = await Product.countDocuments();
        const lowStockProducts = await Product.find({ stock: { $lt: 5 } });
        const recentOrders = await Order.find({ receivedBy: req.user.id })
          .populate('user', 'name')
          .sort({ createdAt: -1 })
          .limit(5);

        res.json({
          role: 'moderator',
          totalRevenue,
          totalOrders,
          totalProducts,
          totalExpenses,
          lowStockProducts,
          recentOrders,
        });
      }
    } catch (error) {
      res.status(500).json({
        message: error.message,
      });
    }
  },
);

const HomeSettings = require('../models/HomeSettings');
const { adminOnly } = require('../middleware/roleMiddleware');

// GET HOMEPAGE SETTINGS (Public)
router.get('/settings', async (req, res) => {
  try {
    let settings = await HomeSettings.findOne();
    if (!settings) {
      settings = await HomeSettings.create({});
    }
    res.json(settings);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// UPDATE HOMEPAGE SETTINGS (Admin Only)
router.put('/settings', protect, adminOnly, async (req, res) => {
  try {
    let settings = await HomeSettings.findOne();
    if (!settings) {
      settings = new HomeSettings({});
    }

    settings.heroImage = req.body.heroImage ?? settings.heroImage;
    settings.heroTitle = req.body.heroTitle ?? settings.heroTitle;
    settings.heroSubtitle = req.body.heroSubtitle ?? settings.heroSubtitle;
    settings.heroDescription = req.body.heroDescription ?? settings.heroDescription;
    settings.heroButtonText = req.body.heroButtonText ?? settings.heroButtonText;
    settings.heroButtonLink = req.body.heroButtonLink ?? settings.heroButtonLink;
    settings.bannerImage = req.body.bannerImage ?? settings.bannerImage;
    settings.bannerLink = req.body.bannerLink ?? settings.bannerLink;
    settings.showBanner = req.body.showBanner !== undefined ? req.body.showBanner : settings.showBanner;

    await settings.save();
    res.json(settings);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
