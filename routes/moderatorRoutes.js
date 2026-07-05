const express = require('express');
const router = express.Router();
const ProductEditRequest = require('../models/ProductEditRequest');
const ProductDeleteRequest = require('../models/ProductDeleteRequest');
const InventoryNote = require('../models/InventoryNote');
const ModeratorTask = require('../models/ModeratorTask');
const Expense = require('../models/Expense');
const Order = require('../models/Order');
const Product = require('../models/Product');
const protect = require('../middleware/authMiddleware');
const { adminOnly, adminOrModerator } = require('../middleware/roleMiddleware');

// ==========================================
// 1. DASHBOARD STATS (For Moderator)
// ==========================================
router.get('/dashboard-stats', protect, adminOrModerator, async (req, res) => {
  try {
    const isMod = req.user.role === 'moderator';
    const userId = req.user.id;

    // Date boundaries for current month
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // 1. Proposals (Edit Requests) count
    const pendingEdits = await ProductEditRequest.countDocuments({
      moderator: userId,
      status: 'Pending'
    });
    const pendingDeletes = await ProductDeleteRequest.countDocuments({
      moderator: userId,
      status: 'Pending'
    });
    const totalProposals = pendingEdits + pendingDeletes;

    // 2. Claimed Orders status counts
    let orderQuery = {};
    if (isMod) {
      orderQuery.receivedBy = userId;
    }
    const claimedOrders = await Order.find(orderQuery);
    const totalOrdersCount = claimedOrders.length;
    const pendingOrdersCount = claimedOrders.filter(o => o.status === 'Pending').length;
    const processingOrdersCount = claimedOrders.filter(o => o.status === 'Processing').length;
    const shippedOrdersCount = claimedOrders.filter(o => o.status === 'Shipped').length;
    const deliveredOrdersCount = claimedOrders.filter(o => o.status === 'Delivered').length;

    // 3. Placed sales (total sales, profit margins)
    const placedSales = await Order.find({ moderatorUser: userId });
    const monthlyPlacedSales = placedSales.filter(o => new Date(o.createdAt) >= startOfMonth);
    const totalProfitSale = monthlyPlacedSales.reduce((acc, o) => acc + (o.moderatorProfitTotal || 0), 0);

    // 4. Expenses (This month)
    const expenses = await Expense.find({
      user: userId,
      isModeratorExpense: true,
      createdAt: { $gte: startOfMonth }
    });
    const totalExpensesSum = expenses.reduce((acc, e) => acc + (e.amount || 0), 0);

    // 5. Recent activity log items
    const recentEdits = await ProductEditRequest.find({ moderator: userId })
      .populate('product', 'name')
      .sort({ createdAt: -1 })
      .limit(2);
    const recentExpenses = await Expense.find({ user: userId, isModeratorExpense: true })
      .sort({ createdAt: -1 })
      .limit(2);
    const recentNotes = await InventoryNote.find({ moderator: userId })
      .populate('product', 'name')
      .sort({ createdAt: -1 })
      .limit(2);

    const activities = [];
    recentEdits.forEach(e => {
      activities.push({
        _id: e._id,
        type: 'edit_request',
        text: `প্রোডাক্ট এডিট রিকোয়েস্ট জমা দিয়েছেন: ${e.product?.name || 'Unknown'}`,
        time: e.createdAt
      });
    });
    recentExpenses.forEach(ex => {
      activities.push({
        _id: ex._id,
        type: 'expense',
        text: `খরচ যোগ করেছেন: ${ex.title} (৳${ex.amount})`,
        time: ex.createdAt
      });
    });
    recentNotes.forEach(n => {
      activities.push({
        _id: n._id,
        type: 'inventory_note',
        text: `ইনভেন্টরি নোট লিখেছেন: ${n.title}`,
        time: n.createdAt
      });
    });
    activities.sort((a, b) => new Date(b.time) - new Date(a.time));

    res.json({
      totalProposals,
      pendingProposalsCount: totalProposals,
      totalOrdersCount,
      pendingOrdersCount,
      processingOrdersCount,
      shippedOrdersCount,
      deliveredOrdersCount,
      totalExpensesSum,
      totalProfitSale,
      activities: activities.slice(0, 4)
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ==========================================
// 2. PRODUCT EDIT / DELETE REQUESTS
// ==========================================
router.get('/edit-requests', protect, adminOrModerator, async (req, res) => {
  try {
    const edits = await ProductEditRequest.find({ moderator: req.user.id })
      .populate('product', 'name price stock images')
      .sort({ createdAt: -1 });
    const deletes = await ProductDeleteRequest.find({ moderator: req.user.id })
      .populate('product', 'name price stock images')
      .sort({ createdAt: -1 });

    res.json({ edits, deletes });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/edit-requests', protect, adminOrModerator, async (req, res) => {
  try {
    const { product, type, description, images, priceSuggestion, moderatorPriceSuggestion, stockSuggestion, reason } = req.body;

    if (type === 'delete') {
      if (!reason) return res.status(400).json({ message: 'Deletion reason is required' });
      const request = await ProductDeleteRequest.create({
        product,
        reason,
        moderator: req.user.id
      });
      return res.status(201).json(request);
    } else {
      const request = await ProductEditRequest.create({
        product,
        description,
        images,
        priceSuggestion,
        moderatorPriceSuggestion,
        stockSuggestion,
        moderator: req.user.id
      });
      return res.status(201).json(request);
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ==========================================
// 3. INVENTORY NOTES
// ==========================================
router.get('/inventory-notes', protect, adminOrModerator, async (req, res) => {
  try {
    const notes = await InventoryNote.find({})
      .populate('product', 'name')
      .populate('moderator', 'name')
      .sort({ createdAt: -1 });
    res.json(notes);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/inventory-notes', protect, adminOrModerator, async (req, res) => {
  try {
    const { title, type, content, product } = req.body;
    const note = await InventoryNote.create({
      title,
      type,
      content,
      product: product || undefined,
      moderator: req.user.id
    });
    res.status(201).json(note);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ==========================================
// 4. TASKS MANAGEMENT
// ==========================================
router.get('/tasks', protect, adminOrModerator, async (req, res) => {
  try {
    const tasks = await ModeratorTask.find({ assignedTo: req.user.id })
      .populate('assignedBy', 'name')
      .sort({ createdAt: -1 });
    res.json(tasks);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.put('/tasks/:id/complete', protect, adminOrModerator, async (req, res) => {
  try {
    const task = await ModeratorTask.findById(req.params.id);
    if (!task) return res.status(404).json({ message: 'Task not found' });
    if (task.assignedTo.toString() !== req.user.id) {
      return res.status(401).json({ message: 'Not authorized to complete this task' });
    }

    task.status = 'Completed';
    task.completedAt = Date.now();
    await task.save();

    res.json(task);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ==========================================
// 5. EXPENSES TRACKING
// ==========================================
router.get('/expenses', protect, adminOrModerator, async (req, res) => {
  try {
    const expenses = await Expense.find({ user: req.user.id, isModeratorExpense: true })
      .sort({ createdAt: -1 });
    res.json(expenses);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/expenses', protect, adminOrModerator, async (req, res) => {
  try {
    const { title, productCost, courierCost, transportCost, packagingCost, miscCost, notes } = req.body;
    
    const pC = Number(productCost) || 0;
    const cC = Number(courierCost) || 0;
    const tC = Number(transportCost) || 0;
    const paC = Number(packagingCost) || 0;
    const mC = Number(miscCost) || 0;
    const totalAmount = pC + cC + tC + paC + mC;

    const expense = await Expense.create({
      user: req.user.id,
      userName: req.user.name,
      title,
      category: 'Product Purchase',
      amount: totalAmount,
      productCost: pC,
      courierCost: cC,
      transportCost: tC,
      packagingCost: paC,
      miscCost: mC,
      notes,
      isModeratorExpense: true
    });

    res.status(201).json(expense);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ==========================================
// 6. ADMIN SYSTEM MANAGEMENT (Admin Only)
// ==========================================
router.get('/admin/all-requests', protect, adminOnly, async (req, res) => {
  try {
    const edits = await ProductEditRequest.find({})
      .populate('product', 'name price stock images')
      .populate('moderator', 'name')
      .sort({ createdAt: -1 });

    const deletes = await ProductDeleteRequest.find({})
      .populate('product', 'name price stock images')
      .populate('moderator', 'name')
      .sort({ createdAt: -1 });

    const tasks = await ModeratorTask.find({})
      .populate('assignedTo', 'name')
      .populate('assignedBy', 'name')
      .sort({ createdAt: -1 });

    res.json({ edits, deletes, tasks });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/admin/assign-task', protect, adminOnly, async (req, res) => {
  try {
    const { title, description, assignedTo, dueDate } = req.body;
    const task = await ModeratorTask.create({
      title,
      description,
      assignedTo,
      assignedBy: req.user.id,
      dueDate: dueDate || undefined
    });
    res.status(201).json(task);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.put('/admin/review-edit-request/:id', protect, adminOnly, async (req, res) => {
  try {
    const { status, adminNotes } = req.body; // status = 'Approved' | 'Rejected'
    const request = await ProductEditRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ message: 'Request not found' });

    request.status = status;
    request.notes = adminNotes || '';
    await request.save();

    if (status === 'Approved') {
      const product = await Product.findById(request.product);
      if (product) {
        if (request.description) product.shortDesc = request.description;
        if (request.images && request.images.length > 0) product.images = request.images;
        if (request.priceSuggestion !== undefined && request.priceSuggestion > 0) {
          product.price = request.priceSuggestion;
        }
        if (request.moderatorPriceSuggestion !== undefined && request.moderatorPriceSuggestion > 0) {
          product.moderatorPrice = request.moderatorPriceSuggestion;
        }
        if (request.stockSuggestion !== undefined && request.stockSuggestion >= 0) {
          product.stock = request.stockSuggestion;
        }
        await product.save();
      }
    }

    res.json(request);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.put('/admin/review-delete-request/:id', protect, adminOnly, async (req, res) => {
  try {
    const { status, adminNotes } = req.body; // 'Approved' | 'Rejected'
    const request = await ProductDeleteRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ message: 'Request not found' });

    request.status = status;
    request.notes = adminNotes || '';
    await request.save();

    if (status === 'Approved') {
      await Product.findByIdAndDelete(request.product);
    }

    res.json(request);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
