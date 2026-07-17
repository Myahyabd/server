const express = require('express');
const ActionLog = require('../models/ActionLog');
const CartLog = require('../models/CartLog');
const User = require('../models/User');
const Order = require('../models/Order');
const protect = require('../middleware/authMiddleware');

const router = express.Router();

// Helper to check if user is admin
const adminOnly = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    res.status(403).json({ message: 'Not authorized as an admin' });
  }
};

// Helper to parse date range
const getDateRange = (range, startDateStr, endDateStr) => {
  const now = new Date();
  let start = new Date();
  let end = new Date();

  // Set times
  now.setHours(23, 59, 59, 999);

  switch (range) {
    case 'today':
      start.setHours(0, 0, 0, 0);
      end = new Date(now);
      break;
    case 'yesterday':
      start.setDate(start.getDate() - 1);
      start.setHours(0, 0, 0, 0);
      end.setDate(end.getDate() - 1);
      end.setHours(23, 59, 59, 999);
      break;
    case '7days':
      start.setDate(start.getDate() - 7);
      start.setHours(0, 0, 0, 0);
      end = new Date(now);
      break;
    case '30days':
      start.setDate(start.getDate() - 30);
      start.setHours(0, 0, 0, 0);
      end = new Date(now);
      break;
    case 'thismonth':
      start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      end = new Date(now);
      break;
    case 'lastmonth':
      start = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
      end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      break;
    case 'custom':
      if (startDateStr && endDateStr) {
        start = new Date(startDateStr);
        start.setHours(0, 0, 0, 0);
        end = new Date(endDateStr);
        end.setHours(23, 59, 59, 999);
      } else {
        start.setDate(start.getDate() - 7);
        start.setHours(0, 0, 0, 0);
        end = new Date(now);
      }
      break;
    default:
      start.setDate(start.getDate() - 7);
      start.setHours(0, 0, 0, 0);
      end = new Date(now);
  }

  return { start, end };
};

// 1. TRACK CLIENT-SIDE ACTIONS
router.post('/track', async (req, res) => {
  try {
    const { type, product, searchKeyword, sessionToken, userId } = req.body;

    if (!type || !sessionToken) {
      return res.status(400).json({ message: 'Type and sessionToken are required' });
    }

    const logData = {
      type,
      sessionToken,
      searchKeyword: type === 'search' ? searchKeyword : undefined,
      product: product || undefined,
      user: userId || undefined,
    };

    const newLog = await ActionLog.create(logData);
    res.status(201).json(newLog);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// 2. SYNC CLIENT-SIDE CART
router.post('/cart', async (req, res) => {
  try {
    const { sessionToken, items, userId } = req.body;

    if (!sessionToken) {
      return res.status(400).json({ message: 'sessionToken is required' });
    }

    let cart = await CartLog.findOne({ sessionToken });

    if (!cart) {
      cart = new CartLog({ sessionToken });
    }

    cart.items = items || [];
    cart.isAbandoned = true; // reset to true upon updates
    if (userId) {
      cart.user = userId;
    }
    await cart.save();

    res.status(200).json(cart);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// 3. GET FULL ANALYTICS SUMMARY (ADMIN ONLY)
router.get('/summary', protect, adminOnly, async (req, res) => {
  try {
    const { range, startDate, endDate } = req.query;
    const { start, end } = getDateRange(range, startDate, endDate);

    // ==========================================
    // 1. VISITOR ANALYTICS
    // ==========================================
    const totalVisitors = await ActionLog.distinct('sessionToken').then(arr => arr.length);
    const rangeVisitors = await ActionLog.distinct('sessionToken', {
      createdAt: { $gte: start, $lte: end }
    }).then(arr => arr.length);

    // Live Visitors (active in last 5 minutes)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const liveVisitors = await ActionLog.distinct('sessionToken', {
      createdAt: { $gte: fiveMinutesAgo }
    }).then(arr => arr.length);

    // Logged-in vs Guest in range
    const loggedInVisitors = await ActionLog.distinct('sessionToken', {
      createdAt: { $gte: start, $lte: end },
      user: { $ne: null }
    }).then(arr => arr.length);
    const guestVisitors = Math.max(0, rangeVisitors - loggedInVisitors);

    // New vs Returning visitors in range
    // A visitor is "new" if their absolute first action was in the range.
    const allSessionsInRange = await ActionLog.distinct('sessionToken', {
      createdAt: { $gte: start, $lte: end }
    });

    let newVisitors = 0;
    let returningVisitors = 0;

    for (const session of allSessionsInRange) {
      const firstAction = await ActionLog.findOne({ sessionToken: session }).sort({ createdAt: 1 }).select('createdAt');
      if (firstAction && firstAction.createdAt >= start && firstAction.createdAt <= end) {
        newVisitors++;
      } else {
        returningVisitors++;
      }
    }

    // ==========================================
    // 2. USER ANALYTICS
    // ==========================================
    const totalUsers = await User.countDocuments();
    const customerCount = await User.countDocuments({ role: 'customer' });
    const moderatorCount = await User.countDocuments({ role: 'moderator' });
    const adminCount = await User.countDocuments({ role: 'admin' });

    // Today's Registrations
    const startOfToday = new Date();
    startOfToday.setHours(0,0,0,0);
    const endOfToday = new Date();
    endOfToday.setHours(23,59,59,999);
    const todayRegistrations = await User.countDocuments({
      createdAt: { $gte: startOfToday, $lte: endOfToday }
    });

    // Today's Logins (from ActionLog)
    const todayLogins = await ActionLog.distinct('user', {
      type: 'login',
      createdAt: { $gte: startOfToday, $lte: endOfToday }
    }).then(arr => arr.length);

    // Active Users (had actions in range)
    const activeUsers = await ActionLog.distinct('user', {
      createdAt: { $gte: start, $lte: end },
      user: { $ne: null }
    }).then(arr => arr.length);

    // ==========================================
    // 3. PRODUCT ANALYTICS
    // ==========================================
    const productStats = await ActionLog.aggregate([
      { $match: { createdAt: { $gte: start, $lte: end }, product: { $ne: null } } },
      {
        $group: {
          _id: { product: '$product', type: '$type' },
          count: { $sum: 1 }
        }
      },
      {
        $group: {
          _id: '$_id.product',
          views: { $sum: { $cond: [{ $eq: ['$_id.type', 'view'] }, '$count', 0] } },
          cartAdds: { $sum: { $cond: [{ $eq: ['$_id.type', 'cart_add'] }, '$count', 0] } },
          buyNows: { $sum: { $cond: [{ $eq: ['$_id.type', 'buy_now'] }, '$count', 0] } },
          wishlists: { $sum: { $cond: [{ $eq: ['$_id.type', 'wishlist_add'] }, '$count', 0] } }
        }
      },
      { $lookup: { from: 'products', localField: '_id', foreignField: '_id', as: 'prodInfo' } },
      { $unwind: { path: '$prodInfo', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          name: '$prodInfo.name',
          views: 1,
          cartAdds: 1,
          buyNows: 1,
          wishlists: 1,
        }
      }
    ]);

    // Add conversion & orders to product stats
    const orderItemsAggregation = await Order.aggregate([
      { $match: { createdAt: { $gte: start, $lte: end } } },
      { $unwind: '$orderItems' },
      {
        $group: {
          _id: '$orderItems.product',
          ordersCount: { $sum: '$orderItems.qty' },
          deliveredCount: {
            $sum: {
              $cond: [{ $eq: ['$status', 'Delivered'] }, '$orderItems.qty', 0]
            }
          }
        }
      }
    ]);

    const formattedProductStats = productStats.map(ps => {
      const orderData = orderItemsAggregation.find(o => o._id?.toString() === ps._id?.toString()) || { ordersCount: 0, deliveredCount: 0 };
      const totalConversions = orderData.ordersCount;
      const conversionRate = ps.views > 0 ? ((totalConversions / ps.views) * 100).toFixed(1) : '0.0';

      return {
        _id: ps._id,
        name: ps.name || 'Unknown Product',
        views: ps.views,
        cartAdds: ps.cartAdds,
        buyNows: ps.buyNows,
        wishlists: ps.wishlists,
        orders: orderData.ordersCount,
        delivered: orderData.deliveredCount,
        conversionRate
      };
    });

    // ==========================================
    // 4. CART ANALYTICS
    // ==========================================
    const totalCarts = await CartLog.countDocuments();
    const abandonedCarts = await CartLog.countDocuments({ isAbandoned: true });
    const cartAbandonmentRate = totalCarts > 0 ? ((abandonedCarts / totalCarts) * 100).toFixed(1) : '0.0';

    const activeCartsCount = await CartLog.countDocuments({ isAbandoned: false });
    
    // Top Cart Products
    const topCartItems = await CartLog.aggregate([
      { $match: { isAbandoned: true } },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.product',
          count: { $sum: '$items.qty' }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 5 },
      { $lookup: { from: 'products', localField: '_id', foreignField: '_id', as: 'prod' } },
      { $unwind: '$prod' },
      {
        $project: {
          name: '$prod.name',
          count: 1
        }
      }
    ]);

    // ==========================================
    // 5. ORDER & SALES ANALYTICS
    // ==========================================
    const ordersRange = await Order.find({ createdAt: { $gte: start, $lte: end } });
    
    const orderStatusCounts = {
      Pending: 0,
      Processing: 0,
      Shipped: 0,
      Delivered: 0,
      Cancelled: 0,
      Returned: 0
    };

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

    let rangeRevenue = 0;
    let rangeProfit = 0;

    ordersRange.forEach(o => {
      if (orderStatusCounts[o.status] !== undefined) {
        orderStatusCounts[o.status]++;
      }
      if (['Processing', 'Shipped', 'Delivered'].includes(o.status)) {
        rangeRevenue += (o.totalPrice || 0) - (o.deliveryCharge || 0) - (o.codCharge || 0);
        rangeProfit += calculateOrderProfit(o);
      }
    });

    const rangeAOV = ordersRange.length > 0 ? Math.round(rangeRevenue / ordersRange.length) : 0;

    // Today/Week/Month Sales Totals
    const startOfWeek = new Date();
    startOfWeek.setDate(startOfWeek.getDate() - 7);
    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

    const todayOrders = await Order.find({ createdAt: { $gte: startOfToday, $lte: endOfToday } });
    const weekOrders = await Order.find({ createdAt: { $gte: startOfWeek, $lte: endOfToday } });
    const monthOrders = await Order.find({ createdAt: { $gte: startOfMonth, $lte: endOfToday } });

    const getRevenueForSet = (orders) => 
      orders
        .filter(o => ['Processing', 'Shipped', 'Delivered'].includes(o.status))
        .reduce((acc, o) => acc + (o.totalPrice || 0) - (o.deliveryCharge || 0) - (o.codCharge || 0), 0);

    const todaySales = getRevenueForSet(todayOrders);
    const weekSales = getRevenueForSet(weekOrders);
    const monthSales = getRevenueForSet(monthOrders);
    const totalSalesSum = await Order.find().then(orders => getRevenueForSet(orders));

    // ==========================================
    // 6. REFERRAL ANALYTICS
    // ==========================================
    const referralStats = await Order.aggregate([
      { $match: { createdAt: { $gte: start, $lte: end }, referralCode: { $ne: null, $ne: '' } } },
      {
        $group: {
          _id: '$referralCode',
          ordersCount: { $sum: 1 },
          revenue: {
            $sum: {
              $cond: [
                { $in: ['$status', ['Processing', 'Shipped', 'Delivered']] },
                { $subtract: [ '$totalPrice', { $add: [ { $ifNull: ['$deliveryCharge', 0] }, { $ifNull: ['$codCharge', 0] } ] } ] },
                0
              ]
            }
          },
          commission: {
            $sum: {
              $cond: [
                { $in: ['$status', ['Processing', 'Shipped', 'Delivered']] },
                '$moderatorProfitTotal',
                0
              ]
            }
          }
        }
      },
      { $sort: { ordersCount: -1 } }
    ]);

    // Top referral details
    const topReferralDetail = referralStats.length > 0 ? referralStats[0] : null;

    // ==========================================
    // 7. BEHAVIOR ANALYTICS
    // ==========================================
    const topKeywords = await ActionLog.aggregate([
      { $match: { createdAt: { $gte: start, $lte: end }, type: 'search', searchKeyword: { $ne: null, $ne: '' } } },
      { $group: { _id: '$searchKeyword', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);

    const topCategories = await Order.aggregate([
      { $match: { createdAt: { $gte: start, $lte: end } } },
      { $unwind: '$orderItems' },
      { $lookup: { from: 'products', localField: 'orderItems.product', foreignField: '_id', as: 'pInfo' } },
      { $unwind: '$pInfo' },
      {
        $group: {
          _id: '$pInfo.category',
          count: { $sum: '$orderItems.qty' }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 5 }
    ]);

    // Top Selling Products
    const topSellingProducts = await Order.aggregate([
      { $match: { createdAt: { $gte: start, $lte: end }, status: 'Delivered' } },
      { $unwind: '$orderItems' },
      {
        $group: {
          _id: '$orderItems.product',
          totalQty: { $sum: '$orderItems.qty' }
        }
      },
      { $sort: { totalQty: -1 } },
      { $limit: 5 },
      { $lookup: { from: 'products', localField: '_id', foreignField: '_id', as: 'prod' } },
      { $unwind: '$prod' },
      {
        $project: {
          name: '$prod.name',
          qty: '$totalQty'
        }
      }
    ]);

    // Low Performing Products (High views, low/zero conversions)
    const lowPerformingProducts = formattedProductStats
      .filter(p => p.views >= 5 && p.orders === 0)
      .sort((a, b) => b.views - a.views)
      .slice(0, 5);

    // ==========================================
    // 8. CHART DATA GENERATION
    // ==========================================
    // Group page views, sales, and registrations by day
    const chartDays = [];
    const tempStart = new Date(start);
    while (tempStart <= end) {
      chartDays.push(new Date(tempStart));
      tempStart.setDate(tempStart.getDate() + 1);
    }

    const chartData = [];
    for (const day of chartDays) {
      const dayStart = new Date(day);
      dayStart.setHours(0,0,0,0);
      const dayEnd = new Date(day);
      dayEnd.setHours(23,59,59,999);

      const viewsCount = await ActionLog.countDocuments({
        type: 'view',
        createdAt: { $gte: dayStart, $lte: dayEnd }
      });

      const dayOrdersList = await Order.find({
        createdAt: { $gte: dayStart, $lte: dayEnd }
      });

      const ordersCount = dayOrdersList.length;
      const salesCount = getRevenueForSet(dayOrdersList);

      const registrationsCount = await User.countDocuments({
        createdAt: { $gte: dayStart, $lte: dayEnd }
      });

      const cartAddsCount = await ActionLog.countDocuments({
        type: 'cart_add',
        createdAt: { $gte: dayStart, $lte: dayEnd }
      });

      chartData.push({
        date: day.toLocaleDateString([], { month: 'short', day: 'numeric' }),
        visitors: viewsCount,
        orders: ordersCount,
        sales: salesCount,
        registrations: registrationsCount,
        cartAdds: cartAddsCount
      });
    }

    res.json({
      visitorStats: {
        totalVisitors,
        rangeVisitors,
        liveVisitors,
        loggedInVisitors,
        guestVisitors,
        newVisitors,
        returningVisitors
      },
      userStats: {
        totalUsers,
        customerCount,
        moderatorCount,
        adminCount,
        todayRegistrations,
        todayLogins,
        activeUsers
      },
      productStats: formattedProductStats,
      cartStats: {
        totalCarts,
        abandonedCarts,
        cartAbandonmentRate,
        activeCartsCount,
        topCartItems
      },
      orderStats: {
        counts: orderStatusCounts,
        total: ordersRange.length
      },
      salesStats: {
        todaySales,
        weekSales,
        monthSales,
        totalSales: totalSalesSum,
        rangeRevenue,
        rangeProfit,
        rangeAOV
      },
      referralStats: {
        usageList: referralStats,
        topReferral: topReferralDetail
      },
      behaviourStats: {
        topKeywords,
        topCategories,
        topSellingProducts,
        lowPerformingProducts
      },
      chartData
    });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
