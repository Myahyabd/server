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
      const packaging = order.giftDetails?.packagingCost || 0;
      const other = order.giftDetails?.otherExpense || 0;
      const delivery = order.deliveryCharge || 0;
      const modCommission = order.isModeratorOrder ? (order.moderatorProfitTotal || 0) : 0;

      if (order.isGift) {
        return 0 - landedCost - packaging - other - delivery;
      } else {
        return (order.totalPrice || 0) - delivery - landedCost - packaging - other - modCommission;
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
      const orderRevenue = (o.totalPrice || 0) - (o.deliveryCharge || 0) - (o.codCharge || 0);

      totalRevenue += orderRevenue;
      totalProfit += profit;
      totalCouponDiscount += o.couponDiscount || 0;
      totalReferralDiscount += o.referralDiscount || 0;
      
      if (isGiftVal) {
        const cost = (o.landedCostTotal || 0) + (o.giftDetails?.packagingCost || 0) + (o.giftDetails?.otherExpense || 0) + (o.deliveryCharge || 0);
        totalGiftExpense += cost;
      }

      if (orderDate >= todayStart) {
        todaySales += orderRevenue;
      } else if (orderDate >= yesterdayStart && orderDate < todayStart) {
        yesterdaySales += orderRevenue;
      }
      if (orderDate >= monthStart) {
        monthlySales += orderRevenue;
      }
      if (orderDate >= yearStart) {
        yearlySales += orderRevenue;
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
    
    let totalInventoryLoss = 0;
    try {
      const StockAdjustment = require('../models/StockAdjustment');
      const adjustments = await StockAdjustment.find() || [];
      totalInventoryLoss = adjustments.reduce((acc, item) => acc + (item.totalLossAmount || 0), 0);
    } catch (err) {
      console.error('Failed to calculate stock adjustment loss for dashboard:', err);
    }

    const netBenefit = totalProfit - totalExpenses - totalInventoryLoss;

    step = 'fetch-products-users';
    const totalProducts = await Product.countDocuments() || 0;
    const totalUsers = await User.countDocuments({ role: 'customer' }) || 0;
    const lowStockProducts = await Product.find({ stock: { $lt: 5 } }).select('name stock price') || [];
    const outOfStockProducts = await Product.find({ stock: 0 }).select('name stock price') || [];

    // Calculate total stock quantity, total stock value, and total stock landed cost - Admin Only
    let totalStockQty = 0;
    let totalStockValue = 0;
    let totalStockLandedCost = 0;

    let totalDigitalStockQty = 0;
    let totalDigitalStockValue = 0;
    let totalDigitalStockLandedCost = 0;

    if (isAdmin) {
      const productsList = await Product.find({}) || [];
      productsList.forEach(p => {
        const isDig = p.isDigital === true;
        if (p.hasVariants && p.variants && p.variants.length > 0) {
          p.variants.forEach(v => {
            const qty = Number(v.stock || 0);
            const valPrice = Number(v.salePrice || v.price || p.salePrice || p.price || 0);
            const landedCostPrice = Number(v.landedCost || v.buyingPrice || p.landedCost || p.buyingPrice || 0);
            if (isDig) {
              totalDigitalStockQty += qty;
              totalDigitalStockValue += (qty * valPrice);
              totalDigitalStockLandedCost += (qty * landedCostPrice);
            } else {
              totalStockQty += qty;
              totalStockValue += (qty * valPrice);
              totalStockLandedCost += (qty * landedCostPrice);
            }
          });
        } else {
          const qty = Number(p.stock || 0);
          const valPrice = Number(p.salePrice || p.price || 0);
          const landedCostPrice = Number(p.landedCost || p.buyingPrice || 0);
          if (isDig) {
            totalDigitalStockQty += qty;
            totalDigitalStockValue += (qty * valPrice);
            totalDigitalStockLandedCost += (qty * landedCostPrice);
          } else {
            totalStockQty += qty;
            totalStockValue += (qty * valPrice);
            totalStockLandedCost += (qty * landedCostPrice);
          }
        }
      });
    }

    step = 'recent-orders';
    const recentOrders = allOrders.slice(0, 5) || [];

    step = 'product-sales-analytics';
    const allProductsInDb = await Product.find({}).select('name price salePrice landedCost') || [];
    const productSalesMapAll = {};
    allProductsInDb.forEach(p => {
      productSalesMapAll[p._id.toString()] = {
        id: p._id.toString(),
        name: p.name,
        qty: 0,
        revenue: 0,
        profit: 0
      };
    });

    activeOrders.forEach(o => {
      if (!o || !o.orderItems || !Array.isArray(o.orderItems)) return;
      o.orderItems.forEach(item => {
        if (!item || !item.product) return;
        const pId = item.product.toString();
        const itemQty = item.qty || 0;
        const price = item.price || 0;
        const buyingCost = item.buyingCost || 0;
        const revenue = price * itemQty;
        const profit = revenue - (buyingCost * itemQty);

        if (!productSalesMapAll[pId]) {
          productSalesMapAll[pId] = { id: pId, name: item.name || 'Unknown Product', qty: 0, revenue: 0, profit: 0 };
        }
        productSalesMapAll[pId].qty += itemQty;
        productSalesMapAll[pId].revenue += revenue;
        productSalesMapAll[pId].profit += profit;
      });
    });

    const allSalesData = Object.values(productSalesMapAll);

    // Best selling (top sold qty)
    const bestSellingProducts = [...allSalesData]
      .filter(p => p.qty > 0)
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 10);

    // Slow moving / worst selling (including 0 sales)
    const slowMovingProducts = [...allSalesData]
      .sort((a, b) => a.qty - b.qty)
      .slice(0, 10);

    // Most profitable (sorted by generated profit)
    const mostProfitableProducts = [...allSalesData]
      .filter(p => p.profit > 0)
      .sort((a, b) => b.profit - a.profit)
      .slice(0, 10);

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

    let unclaimedPendingCount = 0;
    if (!isAdmin) {
      unclaimedPendingCount = await Order.countDocuments({
        status: 'Pending',
        $or: [
          { receivedBy: { $exists: false } },
          { receivedBy: null }
        ]
      });
    }

    res.json({
      role: isAdmin ? 'admin' : 'moderator',
      unclaimedPendingCount,
      todaySales,
      yesterdaySales,
      monthlySales,
      yearlySales,
      totalRevenue,
      totalProfit,
      totalExpenses,
      totalSalaries: salaryExpenses,
      netBenefit,
      totalInventoryLoss,
      totalGiftExpense,
      couponDiscount: totalCouponDiscount,
      referralDiscount: totalReferralDiscount,
      totalOrders: allOrders.length,
      totalProducts,
      totalStockQty,
      totalStockValue,
      totalStockLandedCost,
      totalDigitalStockQty,
      totalDigitalStockValue,
      totalDigitalStockLandedCost,
      totalUsers,
      lowStockProducts,
      outOfStockProducts,
      bestSellingProducts,
      slowMovingProducts,
      mostProfitableProducts,
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

    settings.heroSlides = req.body.heroSlides !== undefined ? req.body.heroSlides : settings.heroSlides;
    settings.showSearchBox = req.body.showSearchBox !== undefined ? req.body.showSearchBox : settings.showSearchBox;
    settings.showStatistics = req.body.showStatistics !== undefined ? req.body.showStatistics : settings.showStatistics;
    settings.showTrustBadges = req.body.showTrustBadges !== undefined ? req.body.showTrustBadges : settings.showTrustBadges;
    settings.statistics = req.body.statistics !== undefined ? req.body.statistics : settings.statistics;
    settings.trustBadges = req.body.trustBadges !== undefined ? req.body.trustBadges : settings.trustBadges;

    await settings.save();
    res.json(settings);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
