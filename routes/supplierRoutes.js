const express = require('express');
const router = express.Router();
const Supplier = require('../models/Supplier');
const Purchase = require('../models/Purchase');
const Product = require('../models/Product');
const protect = require('../middleware/authMiddleware');
const { adminOnly } = require('../middleware/roleMiddleware');

// GET ALL SUPPLIERS
router.get('/', protect, adminOnly, async (req, res) => {
  try {
    const suppliers = await Supplier.find().sort({ createdAt: -1 });
    res.json(suppliers);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET SUPPLIER DETAILS
router.get('/:id', protect, adminOnly, async (req, res) => {
  try {
    const supplier = await Supplier.findById(req.params.id);
    if (!supplier) return res.status(404).json({ message: 'Supplier not found' });
    
    const purchases = await Purchase.find({ supplier: supplier._id })
      .populate('product', 'name')
      .sort({ createdAt: -1 });
      
    res.json({ supplier, purchases });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// CREATE / EDIT SUPPLIER
router.post('/', protect, adminOnly, async (req, res) => {
  try {
    const { name, phone, contactPerson, alternativePhone, facebookLink, whatsAppNumber, address, notes } = req.body;
    if (!name || !phone) {
      return res.status(400).json({ message: 'Name and Phone are required' });
    }

    let supplier = await Supplier.findOne({ phone });
    if (supplier) {
      return res.status(400).json({ message: 'Supplier with this phone number already exists' });
    }

    supplier = await Supplier.create({
      name,
      phone,
      contactPerson: contactPerson || '',
      alternativePhone: alternativePhone || '',
      facebookLink: facebookLink || '',
      whatsAppNumber: whatsAppNumber || '',
      address: address || '',
      notes: notes || ''
    });

    res.status(201).json(supplier);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// RECORD STOCK PURCHASE
router.post('/purchase', protect, adminOnly, async (req, res) => {
  try {
    const {
      productId,
      variantName,
      supplierName,
      supplierPhone,
      quantity,
      purchasePrice,
      deliveryCost,
      transportCost,
      otherExpense,
      notes
    } = req.body;

    if (!productId || !supplierPhone || !quantity || purchasePrice === undefined) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    // Find or create supplier
    let supplier = await Supplier.findOne({ phone: supplierPhone });
    if (!supplier) {
      supplier = await Supplier.create({
        name: supplierName || 'Unnamed Supplier',
        phone: supplierPhone,
      });
    } else if (supplierName && supplier.name === 'Unnamed Supplier') {
      supplier.name = supplierName;
      await supplier.save();
    }

    const product = await Product.findById(productId);
    if (!product) return res.status(404).json({ message: 'Product not found' });

    const qty = Number(quantity);
    const priceVal = Number(purchasePrice);
    const delCost = Number(deliveryCost || 0);
    const transCost = Number(transportCost || 0);
    const othExpense = Number(otherExpense || 0);

    const totalCost = priceVal + delCost + transCost + othExpense;
    const purchaseLandedCost = totalCost / qty;

    // Recalculate Product Stock & Landed Cost using Weighted Average
    if (variantName) {
      const variantIndex = product.variants.findIndex(v => v.name === variantName);
      if (variantIndex === -1) {
        return res.status(404).json({ message: 'Variant not found' });
      }
      const variant = product.variants[variantIndex];
      
      const currentStock = variant.stock || 0;
      const currentLanded = variant.landedCost || 0;
      const newStock = currentStock + qty;
      const newLandedCost = newStock > 0 
        ? ((currentStock * currentLanded) + (qty * purchaseLandedCost)) / newStock
        : purchaseLandedCost;

      variant.stock = newStock;
      variant.buyingPrice = priceVal / qty;
      variant.landedCost = newLandedCost;
    } else {
      const currentStock = product.stock || 0;
      const currentLanded = product.landedCost || 0;
      const newStock = currentStock + qty;
      const newLandedCost = newStock > 0
        ? ((currentStock * currentLanded) + (qty * purchaseLandedCost)) / newStock
        : purchaseLandedCost;

      product.stock = newStock;
      product.buyingPrice = priceVal / qty;
      product.landedCost = newLandedCost;
    }

    product.markModified('variants');
    await product.save();

    // Create Purchase record
    const purchase = await Purchase.create({
      product: productId,
      variantName: variantName || '',
      supplier: supplier._id,
      quantity: qty,
      purchasePrice: priceVal,
      deliveryCost: delCost,
      transportCost: transCost,
      otherExpense: othExpense,
      totalCost,
      landedCost: purchaseLandedCost,
      notes: notes || '',
      purchasedBy: req.user.id
    });

    // Update Supplier metrics
    supplier.purchaseCount += 1;
    supplier.lastPurchaseDate = new Date();
    await supplier.save();

    res.status(201).json({
      message: 'Stock purchase recorded successfully',
      purchase,
      product
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
