const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const protect = require('../middleware/authMiddleware');
const { adminOrModerator } = require('../middleware/roleMiddleware');

const Product = require('../models/Product');
const StockHistory = require('../models/StockHistory');
const StockAdjustment = require('../models/StockAdjustment');
const User = require('../models/User');
const SystemSettings = require('../models/SystemSettings');

// 1. GET ALL STOCK ADJUSTMENTS
router.get('/', protect, async (req, res) => {
  try {
    const adjustments = await StockAdjustment.find()
      .populate('product', 'name category images price salePrice')
      .populate('adjustedBy', 'name email phone')
      .sort({ date: -1, createdAt: -1 });
    res.json(adjustments);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// 2. GET LOSS REPORTS
router.get('/reports', protect, async (req, res) => {
  try {
    const adjustments = await StockAdjustment.find();
    
    let damageLoss = 0;
    let lostLoss = 0;
    let correctionLoss = 0;
    let totalItemsDamaged = 0;
    let totalItemsLost = 0;

    adjustments.forEach(adj => {
      if (adj.adjustmentType === 'Damaged') {
        damageLoss += adj.totalLossAmount || 0;
        totalItemsDamaged += adj.quantity || 0;
      } else if (adj.adjustmentType === 'Lost') {
        lostLoss += adj.totalLossAmount || 0;
        totalItemsLost += adj.quantity || 0;
      } else if (adj.adjustmentType === 'Correction' && adj.correctionDirection === 'Decrease') {
        correctionLoss += adj.totalLossAmount || 0;
      }
    });

    res.json({
      damageLoss,
      lostLoss,
      correctionLoss,
      totalInventoryLoss: damageLoss + lostLoss + correctionLoss,
      totalItemsDamaged,
      totalItemsLost
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// 3. GET UNIFIED STOCK LEDGER / HISTORY
router.get('/stock-ledger', protect, async (req, res) => {
  try {
    const ledger = await StockHistory.find()
      .populate('product', 'name category images price salePrice')
      .sort({ createdAt: -1 });
    res.json(ledger);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// 4. CREATE NEW STOCK ADJUSTMENT
router.post('/', protect, async (req, res) => {
  try {
    const {
      product: productId,
      variant: variantName,
      adjustmentType,
      correctionDirection,
      quantity,
      reason,
      note,
      date
    } = req.body;

    if (!productId || !adjustmentType || !quantity || quantity <= 0 || !reason) {
      return res.status(400).json({ message: 'Product, Adjustment Type, valid Quantity, and Reason are required.' });
    }

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ message: 'Product not found.' });
    }

    // Determine direction
    let direction = 'Decrease';
    if (adjustmentType === 'Found') {
      direction = 'Increase';
    } else if (adjustmentType === 'Correction') {
      direction = correctionDirection || 'Decrease';
    }

    // Verify stock and find base landed cost
    let stockBefore = 0;
    let landedCostPerUnit = 0;

    if (product.hasVariants) {
      if (!variantName) {
        return res.status(400).json({ message: 'Product has variants. Please specify a variant.' });
      }
      const vIndex = product.variants.findIndex(v => v.name === variantName);
      if (vIndex === -1) {
        return res.status(404).json({ message: `Variant "${variantName}" not found for this product.` });
      }
      stockBefore = product.variants[vIndex].stock || 0;
      landedCostPerUnit = product.variants[vIndex].landedCost || product.landedCost || 0;
    } else {
      stockBefore = product.stock || 0;
      landedCostPerUnit = product.landedCost || 0;
    }

    // Check if decrease exceeds available stock
    if (direction === 'Decrease' && stockBefore < quantity) {
      return res.status(400).json({ 
        message: `Adjustment quantity (${quantity}) exceeds available stock (${stockBefore}) for ${product.name}${variantName ? ` - ${variantName}` : ''}.` 
      });
    }

    // Update stock
    let stockAfter = stockBefore;
    if (direction === 'Decrease') {
      stockAfter = stockBefore - quantity;
    } else {
      stockAfter = stockBefore + quantity;
    }

    if (product.hasVariants) {
      const vIndex = product.variants.findIndex(v => v.name === variantName);
      product.variants[vIndex].stock = stockAfter;
      product.markModified('variants');
    } else {
      product.stock = stockAfter;
    }

    await product.save();

    // Calculate loss amount
    let totalLossAmount = 0;
    if (direction === 'Decrease' && ['Damaged', 'Lost', 'Correction'].includes(adjustmentType)) {
      totalLossAmount = quantity * landedCostPerUnit;
    }

    // Create Stock History record
    const action = direction === 'Decrease' ? 'MANUAL_REMOVE' : 'MANUAL_ADD';
    const variantLabel = variantName ? ` [Variant: ${variantName}]` : '';
    await StockHistory.create({
      product: product._id,
      action,
      quantity,
      stockBefore,
      stockAfter,
      note: `[Stock Adjustment - ${adjustmentType}]${variantLabel}. Reason: ${reason}. Note: ${note || 'N/A'}`
    });

    // Create Stock Adjustment record
    const user = await User.findById(req.user.id || req.user._id);
    const adjustment = await StockAdjustment.create({
      product: product._id,
      variant: variantName || '',
      adjustmentType,
      correctionDirection: direction,
      quantity,
      reason,
      note: note || '',
      date: date ? new Date(date) : new Date(),
      adjustedBy: req.user.id || req.user._id,
      adjustedByName: user ? user.name : 'System Admin',
      landedCostPerUnit,
      totalLossAmount
    });

    res.status(201).json({
      message: 'Stock adjustment saved successfully.',
      adjustment,
      updatedStock: stockAfter
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
