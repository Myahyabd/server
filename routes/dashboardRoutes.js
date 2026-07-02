const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const Product = require('../models/Product');
const User = require('../models/User');
const Expense = require('../models/Expense');
const HomeSettings = require('../models/HomeSettings');
const protect = require('../middleware/authMiddleware');
const { adminOnly, adminOrModerator } = require('../middleware/roleMiddleware');

// DASHBOARD ANALYTICS
router.get('/analytics', protect, adminOrModerator, async (req, res) => {
  let step = 'start';
  try {
    const isAdmin = req.user.role === 'admin';
    step = 'dates';
    // Date Boundaries
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);
    const monthStart = new Date(todayStart.getFullYear(), todayStart.getMonth(), 1);
    const yearStart = new Date(todayStart.getFullYear(), 0, 1);

    step = 'fetch-orders';
    let orderQuery = {};
    if (!isAdmin) {
      orderQuery.receivedBy = req.user.id;
    }
    const allOrders = await Order.find(orderQuery).populate('user', 'name phone');

    step = 'calculations';
    const calculateOrderProfit = (order) => {
      const landedCost = order.landedCostTotal || 0;
      if (order.isGift) {
        const packaging = order.giftDetails?.packagingCost || 0;
        const other = order.giftDetails?.otherExpense || 0;
        const del = order.deliveryCharge || 0;
        return 0 - landedCost - packaging - other - del;
      } else {
        return (order.totalPrice || 0) - landedCost - (order.deliveryCharge || 0);
      }
    };

    const activeOrders = allOrders.filter(o => o && o.status && !['Cancelled', 'Returned', 'Refunded'].includes(o.status));
    
    let todaySales = 0;
    let yesterdaySales = 0;
    let monthlySales = 0;
    let yearlySales = 0;
    let totalRevenue = 0;
    let totalProfit = 0;
    let totalCouponDiscount = 0;
    let totalReferralDiscount = 0;
    let totalGiftExpense = 0;

    activeOrders.forEach(o => {
      if (!o) return;
      const orderDate = new Date(o.createdAt || Date.now());
      const profit = calculateOrderProfit(o) || 0;
      const isGiftVal = o.isGift;

      totalRevenue += o.totalPrice || 0;
      totalProfit += profit;
      totalCouponDiscount += o.couponDiscount || 0;
      totalReferralDiscount += o.referralDiscount || 0;
      
      if (isGiftVal) {
        const cost = (o.landedCostTotal || 0) + (o.giftDetails?.packagingCost || 0) + (o.giftDetails?.otherExpense || 0) + (o.deliveryCharge || 0);
        totalGiftExpense += cost;
      }

      if (orderDate >= todayStart) {
        todaySales += o.totalPrice || 0;
      } else if (orderDate >= yesterdayStart && orderDate < todayStart) {
        yesterdaySales += o.totalPrice || 0;
      }
      if (orderDate >= monthStart) {
        monthlySales += o.totalPrice || 0;
      }
      if (orderDate >= yearStart) {
        yearlySales += o.totalPrice || 0;
      }
    });

    step = 'fetch-expenses';
    let expenseQuery = {};
    if (!isAdmin) {
      expenseQuery.user = req.user.id;
    }
    const expenses = await Expense.find(expenseQuery) || [];
    const totalExpenses = expenses.reduce((acc, item) => acc + (item.amount || 0), 0);
    const salaryExpenses = expenses.filter(e => e && e.category === 'Salary').reduce((acc, item) => acc + (item.amount || 0), 0);
    const netBenefit = totalProfit - totalExpenses;

    step = 'fetch-products-users';
    const totalProducts = await Product.countDocuments() || 0;
    const totalUsers = await User.countDocuments({ role: 'customer' }) || 0;
    const lowStockProducts = await Product.find({ stock: { $lt: 5 } }).select('name stock price') || [];
    const outOfStockProducts = await Product.find({ stock: 0 }).select('name stock price') || [];

    step = 'recent-orders';
    const recentOrders = allOrders.slice(0, 5) || [];

    step = 'best-selling';
    const productSalesMap = {};
    activeOrders.forEach(o => {
      if (!o || !o.orderItems || !Array.isArray(o.orderItems)) return;
      o.orderItems.forEach(item => {
        if (!item || !item.product) return;
        const pId = item.product.toString();
        if (!productSalesMap[pId]) {
          productSalesMap[pId] = { name: item.name || 'Unknown Product', qty: 0, revenue: 0 };
        }
        productSalesMap[pId].qty += item.qty || 0;
        productSalesMap[pId].revenue += ((item.price || 0) * (item.qty || 0));
      });
    });
    const bestSellingProducts = Object.values(productSalesMap)
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5);

    step = 'top-customers';
    const customerMap = {};
    activeOrders.forEach(o => {
      if (!o || !o.shippingAddress || !o.shippingAddress.phone) return;
      const key = o.shippingAddress.phone;
      if (!customerMap[key]) {
        customerMap[key] = { name: o.shippingAddress.fullName || 'Unknown Customer', phone: o.shippingAddress.phone, ordersCount: 0, spent: 0 };
      }
      customerMap[key].ordersCount += 1;
      customerMap[key].spent += o.totalPrice || 0;
    });
    const topCustomers = Object.values(customerMap)
      .sort((a, b) => b.spent - a.spent)
      .slice(0, 5);

    step = 'top-moderators';
    let topModerators = [];
    if (isAdmin) {
      const modMap = {};
      const allMods = await User.find({ role: 'moderator' }).select('name') || [];
      const modNameLookup = {};
      allMods.forEach(m => { 
        if (m && m._id) modNameLookup[m._id.toString()] = m.name || 'Unknown Staff'; 
      });

      activeOrders.forEach(o => {
        if (!o || !o.receivedBy) return;
        const modId = o.receivedBy.toString();
        if (!modMap[modId]) {
          modMap[modId] = { name: modNameLookup[modId] || 'Unknown Staff', salesCount: 0, revenue: 0 };
        }
        modMap[modId].salesCount += 1;
        modMap[modId].revenue += o.totalPrice || 0;
      });
      topModerators = Object.values(modMap)
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 5);
    }

    step = 'status-counts';
    const statusCounts = {
      Pending: 0,
      Confirmed: 0,
      Delivered: 0,
      Returned: 0,
      Exchange: 0,
      Cancelled: 0,
      Refunded: 0
    };
    allOrders.forEach(o => {
      if (o && o.status && statusCounts[o.status] !== undefined) {
        statusCounts[o.status] += 1;
      }
    });

    res.json({
      role: isAdmin ? 'admin' : 'moderator',
      todaySales,
      yesterdaySales,
      monthlySales,
      yearlySales,
      totalRevenue,
      totalProfit,
      totalExpenses,
      totalSalaries: salaryExpenses,
      netBenefit,
      totalGiftExpense,
      couponDiscount: totalCouponDiscount,
      referralDiscount: totalReferralDiscount,
      totalOrders: allOrders.length,
      totalProducts,
      totalUsers,
      lowStockProducts,
      outOfStockProducts,
      bestSellingProducts,
      topCustomers,
      topModerators,
      recentOrders,
      statusCounts
    });
  } catch (error) {
    res.status(500).json({ 
      message: `Error at step "${step}": ${error.message}`, 
      stack: error.stack 
    });
  }
});

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

    if (req.body.categoryImages !== undefined) {
      settings.categoryImages = req.body.categoryImages;
    }

    await settings.save();
    res.json(settings);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
