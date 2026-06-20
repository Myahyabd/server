const express = require('express');

const router = express.Router();

const Order = require('../models/Order');

const Product = require('../models/Product');

const User = require('../models/User');

const protect = require('../middleware/authMiddleware');

const { adminOnly } = require('../middleware/roleMiddleware');

// DASHBOARD ANALYTICS
router.get(
  '/analytics',

  protect,
  adminOnly,

  async (req, res) => {
    try {
      // TOTAL REVENUE
      const orders = await Order.find();

      const totalRevenue = orders.reduce(
        (acc, item) => acc + item.totalPrice,

        0,
      );

      // TOTAL ORDERS
      const totalOrders = await Order.countDocuments();

      // TOTAL PRODUCTS
      const totalProducts = await Product.countDocuments();

      // TOTAL USERS
      const totalUsers = await User.countDocuments();

      // LOW STOCK
      const lowStockProducts = await Product.find({
        stock: { $lt: 5 },
      });

      // RECENT ORDERS
      const recentOrders = await Order.find()
        .populate('user', 'name')
        .sort({
          createdAt: -1,
        })
        .limit(5);

      res.json({
        totalRevenue,

        totalOrders,

        totalProducts,

        totalUsers,

        lowStockProducts,

        recentOrders,
      });

      // MONTHLY SALES
      const monthlySales = [
        { month: 'Jan', sales: 1200 },

        { month: 'Feb', sales: 2400 },

        { month: 'Mar', sales: 1800 },

        { month: 'Apr', sales: 3200 },

        { month: 'May', sales: 2800 },

        { month: 'Jun', sales: 4000 },
      ];
      
    } catch (error) {
      res.status(500).json({
        message: error.message,
      });
    }
  },
);

module.exports = router;
