const express = require('express');
const router = express.Router();
const Expense = require('../models/Expense');
const User = require('../models/User');
const ExpenseCategory = require('../models/ExpenseCategory');
const ExpenseAuditLog = require('../models/ExpenseAuditLog');
const protect = require('../middleware/authMiddleware');
const { adminOnly, adminOrModerator } = require('../middleware/roleMiddleware');

// ==========================================
// STOCK MANAGEMENT HELPERS FOR GIFT GIVEAWAY
// ==========================================
const restoreStock = async (expense) => {
  if (expense.category === 'Gift Expense' && expense.giftType === 'Giveaway Product' && expense.relatedProduct) {
    const Product = require('../models/Product');
    const product = await Product.findById(expense.relatedProduct);
    if (product) {
      let stockBefore = 0;
      if (product.hasVariants && expense.selectedVariant) {
        const variant = product.variants.find(v => v.name === expense.selectedVariant);
        if (variant) {
          stockBefore = variant.stock;
          variant.stock += 1;
        }
      } else {
        stockBefore = product.stock;
        product.stock += 1;
      }
      product.markModified('variants');
      await product.save();

      try {
        const StockHistory = require('../models/StockHistory');
        await StockHistory.create({
          product: product._id,
          action: 'ORDER_RETURNED',
          quantity: 1,
          stockBefore,
          stockAfter: (product.hasVariants && expense.selectedVariant) ? (product.variants.find(v => v.name === expense.selectedVariant)?.stock || 0) : product.stock,
          note: `Restored 1 unit from deleted/modified Gift Giveaway expense`
        });
      } catch (err) {
        console.error('Failed to log stock restoration history:', err);
      }
    }
  }
};

const deductStock = async (relatedProduct, selectedVariant) => {
  const Product = require('../models/Product');
  const product = await Product.findById(relatedProduct);
  if (!product) {
    throw new Error('Product not found');
  }

  let stockBefore = 0;
  if (product.hasVariants) {
    if (!selectedVariant) {
      throw new Error('Please select a variant for this product');
    }
    const variant = product.variants.find(v => v.name === selectedVariant);
    if (!variant) {
      throw new Error(`Variant "${selectedVariant}" not found for this product`);
    }
    if (variant.stock < 1) {
      throw new Error(`Product variant "${selectedVariant}" is out of stock`);
    }
    stockBefore = variant.stock;
    variant.stock -= 1;
  } else {
    if (product.stock < 1) {
      throw new Error('Product is out of stock');
    }
    stockBefore = product.stock;
    product.stock -= 1;
  }

  product.markModified('variants');
  await product.save();

  try {
    const StockHistory = require('../models/StockHistory');
    await StockHistory.create({
      product: product._id,
      action: 'ORDER_CREATED',
      quantity: 1,
      stockBefore,
      stockAfter: product.hasVariants ? (product.variants.find(v => v.name === selectedVariant)?.stock || 0) : product.stock,
      note: `Deducted 1 unit for Gift Giveaway operational expense`
    });
  } catch (err) {
    console.error('Failed to log stock deduction history:', err);
  }
};

// ==========================================
// SEED DEFAULT CATEGORIES HELPER
// ==========================================
const seedDefaultCategories = async () => {
  const count = await ExpenseCategory.countDocuments();
  if (count === 0) {
    const defaults = [
      'Buying Expense',
      'Packaging Expense',
      'Courier Expense',
      'Delivery Expense',
      'Marketing Expense',
      'Advertising Expense',
      'Gift Expense',
      'Office Expense',
      'Travel Expense',
      'Miscellaneous Expense'
    ];
    await ExpenseCategory.insertMany(defaults.map(name => ({ name })));
  }
};

// ==========================================
// CATEGORY CRUD ROUTES
// ==========================================

// Get Categories
router.get('/categories', protect, adminOrModerator, async (req, res) => {
  try {
    await seedDefaultCategories();
    const categories = await ExpenseCategory.find({}).sort({ name: 1 });
    res.json(categories);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Create Category (Admin Only)
router.post('/categories', protect, adminOnly, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Category name is required' });
    }
    const trimmed = name.trim();
    const exists = await ExpenseCategory.findOne({ name: { $regex: new RegExp(`^${trimmed}$`, 'i') } });
    if (exists) {
      return res.status(400).json({ message: 'Category already exists' });
    }
    const category = await ExpenseCategory.create({ name: trimmed });
    res.status(201).json(category);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Update Category (Admin Only)
router.put('/categories/:id', protect, adminOnly, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Category name is required' });
    }
    const trimmed = name.trim();
    const exists = await ExpenseCategory.findOne({
      _id: { $ne: req.params.id },
      name: { $regex: new RegExp(`^${trimmed}$`, 'i') }
    });
    if (exists) {
      return res.status(400).json({ message: 'Category name already exists' });
    }
    const category = await ExpenseCategory.findByIdAndUpdate(
      req.params.id,
      { name: trimmed },
      { new: true }
    );
    res.json(category);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Delete Category (Admin Only)
router.delete('/categories/:id', protect, adminOnly, async (req, res) => {
  try {
    const category = await ExpenseCategory.findById(req.params.id);
    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }
    const count = await Expense.countDocuments({ category: category.name });
    if (count > 0) {
      return res.status(400).json({ message: `Cannot delete category. It is being used by ${count} expense(s).` });
    }
    await category.deleteOne();
    res.json({ message: 'Category deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ==========================================
// EXPENSE CRUD ROUTES
// ==========================================

// Get Expenses
router.get('/', protect, adminOrModerator, async (req, res) => {
  try {
    let query = {};
    if (req.user.role !== 'admin') {
      query.user = req.user.id;
    }

    const { search, category, startDate, endDate } = req.query;
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { notes: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { userName: { $regex: search, $options: 'i' } },
      ];
    }
    if (category) {
      query.category = category;
    }
    if (startDate || endDate) {
      query.date = {};
      if (startDate) {
        query.date.$gte = new Date(startDate);
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query.date.$lte = end;
      }
    }

    const expenses = await Expense.find(query)
      .populate('relatedProduct', 'name')
      .sort({ date: -1, createdAt: -1 });
    res.json(expenses);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Log Expense
router.post('/', protect, adminOrModerator, async (req, res) => {
  try {
    const {
      title,
      category,
      amount,
      notes,
      description,
      date,
      relatedProduct,
      giftTitle,
      giftType,
      recipientName,
      productCost,
      courierCost,
      packagingCost,
      selectedVariant
    } = req.body;

    if (!title || !category || amount === undefined) {
      return res.status(400).json({ message: 'Title, category, and amount are required' });
    }

    // Deduct stock if Giveaway Product
    if (category === 'Gift Expense' && giftType === 'Giveaway Product' && relatedProduct) {
      try {
        await deductStock(relatedProduct, selectedVariant);
      } catch (err) {
        return res.status(400).json({ message: err.message });
      }
    }

    const expense = await Expense.create({
      user: req.user.id,
      userName: req.user.name,
      title,
      category,
      amount: Number(amount),
      notes: notes || '',
      description: description || '',
      date: date ? new Date(date) : new Date(),
      relatedProduct: relatedProduct || undefined,
      giftTitle: giftTitle || undefined,
      giftType: giftType || undefined,
      recipientName: recipientName || undefined,
      productCost: productCost !== undefined ? Number(productCost) : 0,
      courierCost: courierCost !== undefined ? Number(courierCost) : 0,
      packagingCost: packagingCost !== undefined ? Number(packagingCost) : 0,
      selectedVariant: selectedVariant || undefined,
    });

    await ExpenseAuditLog.create({
      expenseId: expense._id,
      action: 'CREATE',
      performedBy: req.user.id,
      performedByName: req.user.name,
      details: `Created expense: "${title}" of amount ৳${amount} in category "${category}"`,
    });

    res.status(201).json(expense);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Edit/Update Expense
router.put('/:id', protect, adminOrModerator, async (req, res) => {
  try {
    const expense = await Expense.findById(req.params.id);
    if (!expense) {
      return res.status(404).json({ message: 'Expense not found' });
    }

    if (req.user.role !== 'admin' && expense.user.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Access denied: You can only edit your own expenses' });
    }

    const {
      title,
      category,
      amount,
      notes,
      description,
      date,
      relatedProduct,
      giftTitle,
      giftType,
      recipientName,
      productCost,
      courierCost,
      packagingCost,
      selectedVariant
    } = req.body;

    const oldTitle = expense.title;
    const oldAmount = expense.amount;
    const oldCategory = expense.category;

    const oldCat = expense.category;
    const oldType = expense.giftType;
    const oldProd = expense.relatedProduct;
    const oldVar = expense.selectedVariant;

    // Check if we need to restore old stock
    const wasGiveaway = oldCat === 'Gift Expense' && oldType === 'Giveaway Product' && oldProd;
    const isGiveaway = category === 'Gift Expense' && giftType === 'Giveaway Product' && relatedProduct;

    const prodChanged = String(oldProd || '') !== String(relatedProduct || '');
    const varChanged = String(oldVar || '') !== String(selectedVariant || '');

    if (wasGiveaway && (!isGiveaway || prodChanged || varChanged)) {
      // Restore old stock
      await restoreStock(expense);
    }

    if (isGiveaway && (!wasGiveaway || prodChanged || varChanged)) {
      // Deduct new stock
      try {
        await deductStock(relatedProduct, selectedVariant);
      } catch (err) {
        // Rollback old stock if we restored it
        if (wasGiveaway && (!isGiveaway || prodChanged || varChanged)) {
          try {
            await deductStock(oldProd, oldVar);
          } catch (reErr) {
            console.error('Failed to rollback deduction:', reErr);
          }
        }
        return res.status(400).json({ message: err.message });
      }
    }

    expense.title = title || expense.title;
    expense.category = category || expense.category;
    expense.amount = amount !== undefined ? Number(amount) : expense.amount;
    expense.notes = notes !== undefined ? notes : expense.notes;
    expense.description = description !== undefined ? description : expense.description;
    expense.date = date ? new Date(date) : expense.date;
    expense.relatedProduct = relatedProduct || undefined;
    expense.giftTitle = giftTitle || undefined;
    expense.giftType = giftType || undefined;
    expense.recipientName = recipientName || undefined;
    expense.productCost = productCost !== undefined ? Number(productCost) : expense.productCost;
    expense.courierCost = courierCost !== undefined ? Number(courierCost) : expense.courierCost;
    expense.packagingCost = packagingCost !== undefined ? Number(packagingCost) : expense.packagingCost;
    expense.selectedVariant = selectedVariant || undefined;

    await expense.save();

    await ExpenseAuditLog.create({
      expenseId: expense._id,
      action: 'UPDATE',
      performedBy: req.user.id,
      performedByName: req.user.name,
      details: `Updated expense ID ${expense._id}. Changes: Title ("${oldTitle}" -> "${expense.title}"), Amount (৳${oldAmount} -> ৳${expense.amount}), Category ("${oldCategory}" -> "${expense.category}")`,
    });

    res.json(expense);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Delete Expense
router.delete('/:id', protect, adminOrModerator, async (req, res) => {
  try {
    const expense = await Expense.findById(req.params.id);
    if (!expense) {
      return res.status(404).json({ message: 'Expense not found' });
    }

    if (req.user.role !== 'admin' && expense.user.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Access denied: You can only delete your own expenses' });
    }

    // Restore stock if it was a Giveaway Product gift
    await restoreStock(expense);

    await ExpenseAuditLog.create({
      expenseId: expense._id,
      action: 'DELETE',
      performedBy: req.user.id,
      performedByName: req.user.name,
      details: `Deleted expense titled "${expense.title}" of amount ৳${expense.amount} in category "${expense.category}" (added by ${expense.userName})`,
    });

    await expense.deleteOne();
    res.json({ message: 'Expense deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ==========================================
// EXPENSE REPORTS
// ==========================================
router.get('/reports', protect, adminOrModerator, async (req, res) => {
  try {
    let query = {};
    if (req.user.role !== 'admin') {
      query.user = req.user.id;
    }

    const expenses = await Expense.find(query);

    const categorySummary = {};
    const dailySummary = {};
    const monthlySummary = {};
    const yearlySummary = {};

    expenses.forEach(exp => {
      const amt = exp.amount || 0;
      const cat = exp.category || 'Other';
      categorySummary[cat] = (categorySummary[cat] || 0) + amt;

      const expDate = exp.date ? new Date(exp.date) : new Date(exp.createdAt);
      const yyyy = expDate.getFullYear();
      const mm = String(expDate.getMonth() + 1).padStart(2, '0');
      const dd = String(expDate.getDate()).padStart(2, '0');

      const dayKey = `${yyyy}-${mm}-${dd}`;
      const monthKey = `${yyyy}-${mm}`;
      const yearKey = `${yyyy}`;

      dailySummary[dayKey] = (dailySummary[dayKey] || 0) + amt;
      monthlySummary[monthKey] = (monthlySummary[monthKey] || 0) + amt;
      yearlySummary[yearKey] = (yearlySummary[yearKey] || 0) + amt;
    });

    res.json({
      categorySummary,
      dailySummary,
      monthlySummary,
      yearlySummary
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ==========================================
// SALARY AND MODERATORS ENDPOINTS
// ==========================================

// Record Salary (Admin Only)
router.post('/salary', protect, adminOnly, async (req, res) => {
  try {
    const { recipient, amount, notes } = req.body;

    if (!recipient || amount === undefined) {
      return res.status(400).json({ message: 'Recipient and amount are required' });
    }

    const recipientUser = await User.findById(recipient);
    if (!recipientUser) {
      return res.status(404).json({ message: 'Recipient user not found' });
    }

    const expense = await Expense.create({
      user: req.user.id,
      userName: req.user.name,
      title: `Salary Payment to ${recipientUser.name}`,
      category: 'Salary',
      amount: Number(amount),
      recipient: recipientUser._id,
      recipientName: recipientUser.name,
      notes: notes || '',
    });

    await ExpenseAuditLog.create({
      expenseId: expense._id,
      action: 'CREATE',
      performedBy: req.user.id,
      performedByName: req.user.name,
      details: `Created salary payment expense for "${recipientUser.name}" of amount ৳${amount}`,
    });

    res.status(201).json(expense);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get Moderators list for salary dropdown (Admin Only)
router.get('/moderators', protect, adminOnly, async (req, res) => {
  try {
    const users = await User.find({
      role: { $in: ['admin', 'moderator'] },
    }).select('name phone role');
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get Audit Logs (Admin Only)
router.get('/audit-logs', protect, adminOnly, async (req, res) => {
  try {
    const logs = await ExpenseAuditLog.find({}).sort({ createdAt: -1 }).limit(100);
    res.json(logs);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
