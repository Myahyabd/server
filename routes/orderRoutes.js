const express = require('express');

const router = express.Router();

const Order = require('../models/Order');

const StockHistory = require('../models/StockHistory');

const Product = require('../models/Product');

const protect = require('../middleware/authMiddleware');

const { adminOnly, adminOrModerator } = require('../middleware/roleMiddleware');

//
// CREATE ORDER
//
router.post('/', protect, async (req, res) => {
  try {
    const { orderItems, shippingAddress, totalPrice, isOffline, salesChannel } = req.body;

    if (!orderItems || orderItems.length === 0) {
      return res.status(400).json({
        message: 'No order items',
      });
    }
    //
    // STOCK CHECK + REDUCE
    //
    for (const item of orderItems) {
      const product = await Product.findById(item.product);

      if (!product) {
        return res.status(404).json({
          message: 'Product not found',
        });
      }

      // Variant Product
      if (item.variant) {
        const variant = product.variants.find(v => v.name === item.variant);

        if (!variant) {
          return res.status(400).json({
            message: `Variant "${item.variant}" not found`,
          });
        }

        if (variant.stock < item.qty) {
          return res.status(400).json({
            message: `${product.name} (${variant.name}) is out of stock`,
          });
        }

        variant.stock -= item.qty;
      } else {
        // Normal Product
        if (product.stock < item.qty) {
          return res.status(400).json({
            message: `${product.name} out of stock`,
          });
        }

        product.stock -= item.qty;
      }

      await product.save();
    }

    //
    // CREATE ORDER
    //
    const order = new Order({
      user: req.user.id,
      orderItems,
      shippingAddress,
      totalPrice,
      status: isOffline ? 'Delivered' : 'Pending',
      isDelivered: isOffline ? true : false,
      deliveredAt: isOffline ? Date.now() : null,
      receivedBy: isOffline ? req.user.id : null,
      createdBy: isOffline ? req.user.id : null,
      salesChannel: isOffline ? (salesChannel || 'Offline') : 'Online',
    });

    const createdOrder = await order.save();

    res.status(201).json(createdOrder);
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
});

//
// GET MY ORDERS
//
router.get('/my-orders', protect, async (req, res) => {
  try {
    const orders = await Order.find({
      user: req.user.id,
    }).sort({ createdAt: -1 });

    res.json(orders);
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
});

//
// GET ALL ORDERS (ADMIN & MODERATOR SCOPED)
//
router.get('/', protect, adminOrModerator, async (req, res) => {
  try {
    let query = {};
    if (req.user.role !== 'admin') {
      query = {
        $or: [
          { receivedBy: req.user.id },
          { receivedBy: { $exists: false }, status: 'Pending' },
          { receivedBy: null, status: 'Pending' },
        ],
      };
    }

    const orders = await Order.find(query)
      .populate('user', 'name phone')
      .populate('receivedBy', 'name')
      .sort({ createdAt: -1 });

    res.json(orders);
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
});

//
// CLAIM ORDER (MODERATOR/ADMIN)
//
router.put('/:id/claim', protect, adminOrModerator, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({
        message: 'Order not found',
      });
    }

    if (order.receivedBy) {
      return res.status(400).json({
        message: 'Order has already been claimed by another user',
      });
    }

    order.receivedBy = req.user.id;
    order.status = 'Processing';
    await order.save();

    res.json({
      message: 'Order claimed successfully',
      order,
    });
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
});

//
// DELETE ORDER (ADMIN)
//
router.delete('/:id', protect, adminOnly, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({
        message: 'Order not found',
      });
    }

    const stockAlreadyRestored =
      order.status === 'Cancelled' || order.status === 'Returned';

    if (!stockAlreadyRestored) {
      for (const item of order.orderItems) {
        const product = await Product.findById(item.product);

        if (!product) continue;

        if (item.variant) {
          const variant = product.variants.find(v => v.name === item.variant);

          if (variant) {
            variant.stock += item.qty;
          }
        } else {
          product.stock += item.qty;
        }

        await product.save();
      }
    }

    await order.deleteOne();

    res.json({
      message: 'Order deleted successfully',
    });
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
});

//
// UPDATE ORDER STATUS
//
router.put(
  '/:id/status',

  protect,
  adminOrModerator,

  async (req, res) => {
    try {
      const { status } = req.body;

      const order = await Order.findById(req.params.id);

      if (!order) {
        return res.status(404).json({
          message: 'Order not found',
        });
      }

      const alreadyCancelled = order.status === 'Cancelled';
      const alreadyReturned = order.status === 'Returned';

      order.status = status;

      //
      // AUTO DELIVERED
      //
      if (status === 'Delivered') {
        order.isDelivered = true;
        order.deliveredAt = Date.now();
      } else {
        order.isDelivered = false;
        order.deliveredAt = null;
      }

      // প্রথমবার Cancelled বা Returned হলে স্টক ফেরত দিন
      if (
        (status === 'Cancelled' && !alreadyCancelled) ||
        (status === 'Returned' && !alreadyReturned)
      ) {
        for (const item of order.orderItems) {
          const product = await Product.findById(item.product);

          if (!product) continue;

          if (item.variant) {
            const variant = product.variants.find(v => v.name === item.variant);

            if (variant) {
              variant.stock += item.qty;
            }
          } else {
            product.stock += item.qty;
          }

          await product.save();
        }
      }

      await order.save();

      res.json({
        message: 'Order status updated',
      });
    } catch (error) {
      res.status(500).json({
        message: error.message,
      });
    }
  },
);

module.exports = router;
