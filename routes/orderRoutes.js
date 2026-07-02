const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const StockHistory = require('../models/StockHistory');
const Product = require('../models/Product');
const Coupon = require('../models/Coupon');
const User = require('../models/User');
const SystemSettings = require('../models/SystemSettings');
const protect = require('../middleware/authMiddleware');
const { adminOnly, adminOrModerator } = require('../middleware/roleMiddleware');

// HELPER: Stock transition manager on status change
const handleStockForStatusChange = async (order, oldStatus, newStatus) => {
  const stockRestoredStatuses = ['Cancelled', 'Returned', 'Exchange', 'Refunded'];
  const wasRestored = stockRestoredStatuses.includes(oldStatus);
  const isRestoredNow = stockRestoredStatuses.includes(newStatus);

  if (!wasRestored && isRestoredNow) {
    // Return items back to stock
    for (const item of order.orderItems) {
      const product = await Product.findById(item.product);
      if (!product) continue;
      
      let stockBefore = 0;
      if (item.variant) {
        const variant = product.variants.find(v => v.name === item.variant);
        if (variant) {
          stockBefore = variant.stock;
          variant.stock += item.qty;
        }
      } else {
        stockBefore = product.stock;
        product.stock += item.qty;
      }
      product.markModified('variants');
      await product.save();

      // Log stock history
      await StockHistory.create({
        product: item.product,
        action: 'ORDER_RETURNED',
        quantity: item.qty,
        stockBefore,
        stockAfter: item.variant ? product.variants.find(v => v.name === item.variant)?.stock : product.stock,
        note: `Order ${order._id} status changed from ${oldStatus} to ${newStatus}`
      });
    }
  } else if (wasRestored && !isRestoredNow) {
    // Deduct items from stock again (e.g. from Cancelled to Confirmed)
    for (const item of order.orderItems) {
      const product = await Product.findById(item.product);
      if (!product) continue;
      
      let stockBefore = 0;
      if (item.variant) {
        const variant = product.variants.find(v => v.name === item.variant);
        if (variant) {
          stockBefore = variant.stock;
          variant.stock -= item.qty;
        }
      } else {
        stockBefore = product.stock;
        product.stock -= item.qty;
      }
      product.markModified('variants');
      await product.save();

      // Log stock history
      await StockHistory.create({
        product: item.product,
        action: 'ORDER_CREATED',
        quantity: item.qty,
        stockBefore,
        stockAfter: item.variant ? product.variants.find(v => v.name === item.variant)?.stock : product.stock,
        note: `Order ${order._id} status changed from ${oldStatus} to ${newStatus}`
      });
    }
  }
};

// ===================================
// CREATE ORDER (Online or POS/Offline)
// ===================================
router.post('/', protect, async (req, res) => {
  try {
    const {
      orderItems,
      shippingAddress,
      paymentMethod,
      couponCode,
      referralCode,
      isGift,
      giftDetails,
      isOffline,
      salesChannel
    } = req.body;

    if (!orderItems || orderItems.length === 0) {
      return res.status(400).json({ message: 'No order items' });
    }

    // Fetch system settings
    let settings = await SystemSettings.findOne();
    if (!settings) {
      settings = {
        deliverySettings: { type: 'Fixed', fixedCharge: 80, freeDeliveryEnabled: false },
        codSettings: { enabled: true, chargeType: 'Percentage', value: 1 },
        referralSettings: { enabled: true, discountType: 'Percentage', value: 5 }
      };
    }

    // Validate stock and fetch buying/landed cost
    let calculatedOrderItems = [];
    let subtotal = 0;
    let landedCostTotal = 0;

    for (const item of orderItems) {
      const product = await Product.findById(item.product);
      if (!product) {
        return res.status(404).json({ message: `Product ${item.name} not found` });
      }

      let costPrice = 0;
      let sellPrice = item.price; // default to passed price

      // Price constraints validation for moderators
      const isMod = req.user.role === 'moderator';
      if (isMod && !isGift) {
        let minPrice = 0;
        let maxPrice = 0;

        if (item.variant) {
          const variant = product.variants.find(v => v.name === item.variant);
          if (!variant) {
            return res.status(400).json({ message: `Variant ${item.variant} not found for ${product.name}` });
          }
          minPrice = variant.moderatorPrice || 0;
          maxPrice = variant.salePrice || variant.price || 0;
        } else {
          minPrice = product.moderatorPrice || 0;
          maxPrice = product.salePrice || product.price || 0;
        }

        if (sellPrice < minPrice) {
          return res.status(400).json({ message: `Selling Price cannot be lower than the Moderator Price (৳${minPrice}).` });
        }
        if (sellPrice > maxPrice) {
          return res.status(400).json({ message: `Selling Price cannot exceed the Customer Sale Price (৳${maxPrice}).` });
        }
      }

      if (item.variant) {
        const variant = product.variants.find(v => v.name === item.variant);
        if (!variant) {
          return res.status(400).json({ message: `Variant ${item.variant} not found for ${product.name}` });
        }
        if (variant.stock < item.qty) {
          return res.status(400).json({ message: `${product.name} (${variant.name}) is out of stock` });
        }
        
        costPrice = variant.landedCost || variant.buyingPrice || 0;
        
        // Deduct stock if active
        variant.stock -= item.qty;
      } else {
        if (product.stock < item.qty) {
          return res.status(400).json({ message: `${product.name} is out of stock` });
        }
        
        costPrice = product.landedCost || product.buyingPrice || 0;
        
        // Deduct stock
        product.stock -= item.qty;
      }

      product.markModified('variants');
      await product.save();

      subtotal += sellPrice * item.qty;
      landedCostTotal += costPrice * item.qty;

      calculatedOrderItems.push({
        product: item.product,
        name: product.name,
        image: item.image || (product.images && product.images[0]) || '',
        price: isGift ? 0 : sellPrice,
        buyingCost: costPrice,
        qty: item.qty,
        variant: item.variant || ''
      });
    }

    // Calculate Discounts
    let couponDiscount = 0;
    let couponId = null;
    if (couponCode && !isGift) {
      const coupon = await Coupon.findOne({ code: couponCode.toUpperCase(), status: 'Active' });
      if (coupon) {
        const isNotExpired = !coupon.expiryDate || new Date() < coupon.expiryDate;
        const isUnderLimit = coupon.usageLimit === null || coupon.usedCount < coupon.usageLimit;
        const isAboveMin = subtotal >= coupon.minOrder;

        if (isNotExpired && isUnderLimit && isAboveMin) {
          couponId = coupon._id;
          if (coupon.discountType === 'Percentage') {
            couponDiscount = (coupon.value / 100) * subtotal;
            if (coupon.maxDiscount !== null && couponDiscount > coupon.maxDiscount) {
              couponDiscount = coupon.maxDiscount;
            }
          } else {
            couponDiscount = coupon.value;
          }
          coupon.usedCount += 1;
          await coupon.save();
        }
      }
    }

    let referralDiscount = 0;
    let refUsedCode = '';
    if (referralCode && !isGift) {
      const moderator = await User.findOne({
        referralCode: referralCode.toUpperCase(),
        role: { $in: ['admin', 'moderator'] }
      });
      const refConfig = settings.referralSettings;
      if (moderator && refConfig && refConfig.enabled && subtotal >= refConfig.minOrder) {
        refUsedCode = moderator.referralCode;
        if (refConfig.discountType === 'Percentage') {
          referralDiscount = (refConfig.value / 100) * subtotal;
          if (refConfig.maxDiscount !== null && referralDiscount > refConfig.maxDiscount) {
            referralDiscount = refConfig.maxDiscount;
          }
        } else {
          referralDiscount = refConfig.value;
        }
      }
    }

    // Calculate Delivery Charge
    let deliveryCharge = 0;
    const delConfig = settings.deliverySettings;
    if (!isGift) {
      // Check if Free Delivery Rule applies
      let isFreeDelivery = false;
      if (delConfig && delConfig.freeDeliveryEnabled && subtotal >= delConfig.freeDeliveryMinAmount) {
        isFreeDelivery = true;
      }

      if (!isFreeDelivery) {
        if (delConfig.type === 'District' && shippingAddress.district) {
          const match = delConfig.districtCharges.find(
            d => d.district.toLowerCase() === shippingAddress.district.toLowerCase()
          );
          deliveryCharge = match ? match.charge : delConfig.fixedCharge;
        } else if (delConfig.type === 'Courier' && shippingAddress.courier) {
          const match = delConfig.courierCharges.find(
            c => c.courier.toLowerCase() === shippingAddress.courier.toLowerCase()
          );
          deliveryCharge = match ? match.charge : delConfig.fixedCharge;
        } else {
          deliveryCharge = delConfig.fixedCharge || 80;
        }
      }
    } else {
      // For Gifts, delivery cost is saved in giftDetails
      deliveryCharge = 0;
    }

    // Calculate COD Charge
    let codCharge = 0;
    const codConfig = settings.codSettings;
    if (paymentMethod === 'Cash On Delivery' && codConfig && codConfig.enabled && !isGift) {
      const activeSubtotal = subtotal - couponDiscount - referralDiscount;
      if (codConfig.chargeType === 'Percentage') {
        codCharge = Math.round((codConfig.value / 100) * activeSubtotal);
      } else {
        codCharge = codConfig.value;
      }
    }

    // Final Grand Total
    const finalSubtotal = isGift ? 0 : (subtotal - couponDiscount - referralDiscount);
    const totalPrice = finalSubtotal + deliveryCharge + codCharge;

    const order = new Order({
      user: req.user.id,
      orderItems: calculatedOrderItems,
      shippingAddress,
      paymentMethod,
      paymentStatus: isOffline ? 'Paid' : 'Unpaid',
      totalPrice,
      deliveryCharge,
      codCharge,
      discount: couponDiscount + referralDiscount,
      couponApplied: couponId,
      couponDiscount,
      referralUsed: refUsedCode,
      referralDiscount,
      landedCostTotal,
      isGift: !!isGift,
      giftDetails: isGift ? {
        receiverName: giftDetails?.receiverName || shippingAddress.fullName,
        phone: giftDetails?.phone || shippingAddress.phone,
        address: giftDetails?.address || shippingAddress.address,
        reason: giftDetails?.reason || '',
        packagingCost: Number(giftDetails?.packagingCost || 0),
        otherExpense: Number(giftDetails?.otherExpense || 0)
      } : undefined,
      status: isOffline ? 'Delivered' : 'Pending',
      isDelivered: !!isOffline,
      deliveredAt: isOffline ? Date.now() : null,
      receivedBy: isOffline ? req.user.id : null,
      createdBy: req.user.id,
      salesChannel: isOffline ? (salesChannel || 'Offline') : 'Online'
    });

    const createdOrder = await order.save();
    res.status(201).json(createdOrder);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ===================================
// GET MY ORDERS (For Customer)
// ===================================
router.get('/my-orders', protect, async (req, res) => {
  try {
    const orders = await Order.find({ user: req.user.id }).sort({ createdAt: -1 });
    res.json(orders);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ===================================
// GET ALL ORDERS (Admin & Moderator Scoped)
// ===================================
router.get('/', protect, adminOrModerator, async (req, res) => {
  try {
    let query = {};
    if (req.user.role !== 'admin') {
      // Moderator sees claimed orders OR unclaimed Pending orders
      query = {
        $or: [
          { receivedBy: req.user.id },
          { receivedBy: { $exists: false }, status: 'Pending' },
          { receivedBy: null, status: 'Pending' }
        ]
      };
    }
    const orders = await Order.find(query)
      .populate('user', 'name phone')
      .populate('receivedBy', 'name')
      .sort({ createdAt: -1 });

    res.json(orders);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ===================================
// CLAIM ORDER (Moderator)
// ===================================
router.put('/:id/claim', protect, adminOrModerator, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    if (order.receivedBy) {
      return res.status(400).json({ message: 'Order already claimed by another user' });
    }

    order.receivedBy = req.user.id;
    order.status = 'Confirmed'; // Move to Confipped/Confirmed status
    await order.save();

    res.json({ message: 'Order claimed successfully', order });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ===================================
// UPDATE ORDER STATUS (7-Status Machine)
// ===================================
router.put('/:id/status', protect, adminOrModerator, async (req, res) => {
  try {
    const { status, paymentStatus } = req.body;
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });

    const oldStatus = order.status;

    // Handle stock changes
    await handleStockForStatusChange(order, oldStatus, status);

    order.status = status;
    if (status === 'Delivered') {
      order.isDelivered = true;
      order.deliveredAt = Date.now();
      order.paymentStatus = 'Paid';
    } else if (status === 'Cancelled' || status === 'Returned' || status === 'Refunded') {
      order.isDelivered = false;
      order.deliveredAt = null;
    }

    if (paymentStatus) {
      order.paymentStatus = paymentStatus;
    }

    await order.save();
    res.json({ message: 'Order status updated successfully', order });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ===================================
// GET SINGLE ORDER DETAILS (Invoice)
// ===================================
router.get('/:id', protect, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('user', 'name phone email role')
      .populate('receivedBy', 'name');

    if (!order) return res.status(404).json({ message: 'Order not found' });

    // Enforce role check
    const isCustomer = req.user.role === 'customer';
    if (isCustomer && order.user._id.toString() !== req.user.id.toString()) {
      return res.status(401).json({ message: 'Unauthorized access to this order' });
    }

    res.json(order);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ===================================
// DELETE ORDER (Admin Only)
// ===================================
router.delete('/:id', protect, adminOnly, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });

    // Restore stock if it was not in a restored state
    const stockRestoredStatuses = ['Cancelled', 'Returned', 'Exchange', 'Refunded'];
    if (!stockRestoredStatuses.includes(order.status)) {
      for (const item of order.orderItems) {
        const product = await Product.findById(item.product);
        if (!product) continue;
        if (item.variant) {
          const variant = product.variants.find(v => v.name === item.variant);
          if (variant) variant.stock += item.qty;
        } else {
          product.stock += item.qty;
        }
        product.markModified('variants');
        await product.save();
      }
    }

    await order.deleteOne();
    res.json({ message: 'Order deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
