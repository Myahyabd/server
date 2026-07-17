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

// GET ALL STOCK PURCHASES
router.get('/purchases/all', protect, adminOnly, async (req, res) => {
  try {
    const purchases = await Purchase.find()
      .populate('product', 'name')
      .populate('supplier', 'name company phone')
      .sort({ createdAt: -1 });
    res.json(purchases);
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

const PurchaseInvoice = require('../models/PurchaseInvoice');
const Expense = require('../models/Expense');

// GET ALL PURCHASE INVOICES
router.get('/invoices/all', protect, adminOnly, async (req, res) => {
  try {
    const invoices = await PurchaseInvoice.find()
      .populate('supplier', 'name phone')
      .populate('items.product', 'name')
      .sort({ createdAt: -1 });
    res.json(invoices);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// CREATE PURCHASE INVOICE (Combined purchase of multiple items)
router.post('/purchase-invoice', protect, adminOnly, async (req, res) => {
  try {
    const {
      supplierName,
      supplierPhone,
      deliveryCost,
      discount,
      notes,
      items // Array of: { product, variantName, quantity, unitPrice, notes }
    } = req.body;

    if (!supplierPhone || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'Missing required supplier or items fields' });
    }

    // 1. Find or create supplier
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

    // 2. Parse items and compute base subtotal
    let subTotal = 0;
    const itemsData = [];

    for (const item of items) {
      const qty = Number(item.quantity);
      const unit = Number(item.unitPrice);
      const baseTotal = qty * unit;
      subTotal += baseTotal;

      itemsData.push({
        product: item.product,
        variantName: item.variantName || '',
        quantity: qty,
        purchasePrice: baseTotal, // Base price total for this item
        unitPrice: unit,
        notes: item.notes || ''
      });
    }

    const deliveryVal = Number(deliveryCost || 0);
    const discountVal = Number(discount || 0);
    const totalAmount = subTotal + deliveryVal - discountVal;

    // 3. Proportional allocation for Landed Cost
    for (const item of itemsData) {
      const ratio = subTotal > 0 ? (item.purchasePrice / subTotal) : 0;
      item.proportionalDelivery = deliveryVal * ratio;
      item.proportionalDiscount = discountVal * ratio;
      item.totalCost = item.purchasePrice + item.proportionalDelivery - item.proportionalDiscount;
      item.landedCost = item.totalCost / item.quantity;
    }

    // 4. Generate unique invoice number
    const invoiceNumber = `INV-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

    // 5. Create Expense Record
    const expense = await Expense.create({
      user: req.user.id,
      userName: req.user.name,
      title: `📦 Purchase Invoice (${invoiceNumber}) - ${supplier.name}`,
      category: 'Product Purchase',
      amount: totalAmount,
      date: new Date(),
      notes: `Subtotal: ৳${subTotal}, Delivery: ৳${deliveryVal}, Discount: ৳${discountVal}. Notes: ${notes || ''}`
    });

    // 6. Create PurchaseInvoice
    const invoice = await PurchaseInvoice.create({
      invoiceNumber,
      supplier: supplier._id,
      items: itemsData,
      deliveryCost: deliveryVal,
      discount: discountVal,
      subTotal,
      totalAmount,
      notes: notes || '',
      purchasedBy: req.user.id,
      expenseId: expense._id
    });

    // 7. Update product stock & landed cost, and create Purchase records
    for (const item of itemsData) {
      const product = await Product.findById(item.product);
      if (!product) continue;

      const qty = item.quantity;
      const purchaseLandedCost = item.landedCost;
      const basePrice = item.purchasePrice;

      if (item.variantName) {
        const variantIndex = product.variants.findIndex(v => v.name === item.variantName);
        if (variantIndex !== -1) {
          const variant = product.variants[variantIndex];
          const currentStock = variant.stock || 0;
          const currentLanded = variant.landedCost || 0;
          const newStock = currentStock + qty;
          const newLandedCost = newStock > 0 
            ? ((currentStock * currentLanded) + (qty * purchaseLandedCost)) / newStock
            : purchaseLandedCost;
          
          variant.stock = newStock;
          variant.buyingPrice = basePrice / qty;
          variant.landedCost = newLandedCost;
        }
      } else {
        const currentStock = product.stock || 0;
        const currentLanded = product.landedCost || 0;
        const newStock = currentStock + qty;
        const newLandedCost = newStock > 0
          ? ((currentStock * currentLanded) + (qty * purchaseLandedCost)) / newStock
          : purchaseLandedCost;
        
        product.stock = newStock;
        product.buyingPrice = basePrice / qty;
        product.landedCost = newLandedCost;

        // Propagate buyingPrice and landedCost to variants that don't have them
        if (product.hasVariants && product.variants && product.variants.length > 0) {
          product.variants.forEach(v => {
            if (!v.buyingPrice || v.buyingPrice === 0) {
              v.buyingPrice = basePrice / qty;
            }
            if (!v.landedCost || v.landedCost === 0) {
              v.landedCost = newLandedCost;
            }
          });
        }
      }
      product.markModified('variants');
      await product.save();

      // Create separate Purchase record so it shows up in standard reports
      await Purchase.create({
        product: item.product,
        variantName: item.variantName || '',
        supplier: supplier._id,
        quantity: qty,
        purchasePrice: basePrice,
        deliveryCost: item.proportionalDelivery,
        transportCost: 0,
        otherExpense: 0,
        totalCost: item.totalCost,
        landedCost: item.landedCost,
        notes: `Part of Invoice ${invoiceNumber}. ${item.notes || ''}`,
        purchasedBy: req.user.id
      });
    }

    // 8. Update Supplier metrics
    supplier.purchaseCount += 1;
    supplier.lastPurchaseDate = new Date();
    await supplier.save();

    res.status(201).json({
      message: 'Purchase invoice recorded successfully',
      invoice,
      expense
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// UPDATE PURCHASE INVOICE
router.put('/invoices/:id', protect, adminOnly, async (req, res) => {
  try {
    const invoice = await PurchaseInvoice.findById(req.params.id);
    if (!invoice) return res.status(404).json({ message: 'Invoice not found' });

    const {
      supplierPhone,
      deliveryCost,
      discount,
      notes,
      items // Array of: { product, variantName, quantity, unitPrice, notes }
    } = req.body;

    if (!supplierPhone || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'Missing required supplier or items fields' });
    }

    // 1. Revert OLD stock changes
    for (const item of invoice.items) {
      const product = await Product.findById(item.product);
      if (product) {
        if (item.variantName) {
          const variantIndex = product.variants.findIndex(v => v.name === item.variantName);
          if (variantIndex !== -1) {
            const variant = product.variants[variantIndex];
            variant.stock = Math.max(0, (variant.stock || 0) - item.quantity);
          }
        } else {
          product.stock = Math.max(0, (product.stock || 0) - item.quantity);
        }
        product.markModified('variants');
        await product.save();
      }
    }

    // 2. Delete OLD associated Purchase records
    await Purchase.deleteMany({ notes: new RegExp(`Part of Invoice ${invoice.invoiceNumber}`) });

    // 3. Find/Update Supplier
    let supplier = await Supplier.findOne({ phone: supplierPhone });
    if (!supplier) {
      supplier = await Supplier.create({
        name: req.body.supplierName || 'Unnamed Supplier',
        phone: supplierPhone,
      });
    }

    // 4. Parse NEW items and compute base subtotal
    let subTotal = 0;
    const itemsData = [];

    for (const item of items) {
      const qty = Number(item.quantity);
      const unit = Number(item.unitPrice);
      const baseTotal = qty * unit;
      subTotal += baseTotal;

      itemsData.push({
        product: item.product,
        variantName: item.variantName || '',
        quantity: qty,
        purchasePrice: baseTotal,
        unitPrice: unit,
        notes: item.notes || ''
      });
    }

    const deliveryVal = Number(deliveryCost || 0);
    const discountVal = Number(discount || 0);
    const totalAmount = subTotal + deliveryVal - discountVal;

    // 5. Proportional allocation for Landed Cost
    for (const item of itemsData) {
      const ratio = subTotal > 0 ? (item.purchasePrice / subTotal) : 0;
      item.proportionalDelivery = deliveryVal * ratio;
      item.proportionalDiscount = discountVal * ratio;
      item.totalCost = item.purchasePrice + item.proportionalDelivery - item.proportionalDiscount;
      item.landedCost = item.totalCost / item.quantity;
    }

    // 6. Update associated Expense Record
    if (invoice.expenseId) {
      await Expense.findByIdAndUpdate(invoice.expenseId, {
        amount: totalAmount,
        title: `📦 Purchase Invoice (${invoice.invoiceNumber}) - ${supplier.name}`,
        notes: `Subtotal: ৳${subTotal}, Delivery: ৳${deliveryVal}, Discount: ৳${discountVal}. Notes: ${notes || ''}`
      });
    }

    // 7. Update/save products stock, landed cost and create Purchase records
    for (const item of itemsData) {
      const product = await Product.findById(item.product);
      if (!product) continue;

      const qty = item.quantity;
      const purchaseLandedCost = item.landedCost;
      const basePrice = item.purchasePrice;

      if (item.variantName) {
        const variantIndex = product.variants.findIndex(v => v.name === item.variantName);
        if (variantIndex !== -1) {
          const variant = product.variants[variantIndex];
          const currentStock = variant.stock || 0;
          const currentLanded = variant.landedCost || 0;
          const newStock = currentStock + qty;
          const newLandedCost = newStock > 0 
            ? ((currentStock * currentLanded) + (qty * purchaseLandedCost)) / newStock
            : purchaseLandedCost;
          
          variant.stock = newStock;
          variant.buyingPrice = basePrice / qty;
          variant.landedCost = newLandedCost;
        }
      } else {
        const currentStock = product.stock || 0;
        const currentLanded = product.landedCost || 0;
        const newStock = currentStock + qty;
        const newLandedCost = newStock > 0
          ? ((currentStock * currentLanded) + (qty * purchaseLandedCost)) / newStock
          : purchaseLandedCost;
        
        product.stock = newStock;
        product.buyingPrice = basePrice / qty;
        product.landedCost = newLandedCost;
      }
      product.markModified('variants');
      await product.save();

      // Create new Purchase record
      await Purchase.create({
        product: item.product,
        variantName: item.variantName || '',
        supplier: supplier._id,
        quantity: qty,
        purchasePrice: basePrice,
        deliveryCost: item.proportionalDelivery,
        transportCost: 0,
        otherExpense: 0,
        totalCost: item.totalCost,
        landedCost: item.landedCost,
        notes: `Part of Invoice ${invoice.invoiceNumber}. ${item.notes || ''}`,
        purchasedBy: req.user.id
      });
    }

    // 8. Update Invoice doc
    invoice.supplier = supplier._id;
    invoice.items = itemsData;
    invoice.deliveryCost = deliveryVal;
    invoice.discount = discountVal;
    invoice.subTotal = subTotal;
    invoice.totalAmount = totalAmount;
    invoice.notes = notes || '';
    await invoice.save();

    res.json({ message: 'Purchase invoice updated and inventory updated successfully', invoice });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE PURCHASE INVOICE
router.delete('/invoices/:id', protect, adminOnly, async (req, res) => {
  try {
    const invoice = await PurchaseInvoice.findById(req.params.id);
    if (!invoice) return res.status(404).json({ message: 'Invoice not found' });

    // 1. Delete associated Expense
    if (invoice.expenseId) {
      await Expense.findByIdAndDelete(invoice.expenseId);
    }

    // 2. Delete associated Purchase records
    await Purchase.deleteMany({ notes: new RegExp(`Part of Invoice ${invoice.invoiceNumber}`) });

    // 3. Revert stock changes on products
    for (const item of invoice.items) {
      const product = await Product.findById(item.product);
      if (product) {
        if (item.variantName) {
          const variantIndex = product.variants.findIndex(v => v.name === item.variantName);
          if (variantIndex !== -1) {
            const variant = product.variants[variantIndex];
            variant.stock = Math.max(0, (variant.stock || 0) - item.quantity);
          }
        } else {
          product.stock = Math.max(0, (product.stock || 0) - item.quantity);
        }
        product.markModified('variants');
        await product.save();
      }
    }

    // 4. Delete the invoice itself
    await PurchaseInvoice.findByIdAndDelete(req.params.id);

    res.json({ message: 'Purchase invoice deleted and inventory reverted successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
