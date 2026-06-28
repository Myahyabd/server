const express = require('express');
const router = express.Router();
const Expense = require('../models/Expense');
const User = require('../models/User');
const protect = require('../middleware/authMiddleware');
const { adminOnly, adminOrModerator } = require('../middleware/roleMiddleware');

// ==============================
// LOG AN EXPENSE (Moderator & Admin)
// ==============================
router.post('/', protect, adminOrModerator, async (req, res) => {
  try {
    const { title, category, amount, notes } = req.body;

    if (!title || !category || amount === undefined) {
      return res.status(400).json({ message: 'Title, category, and amount are required' });
    }

    const expense = await Expense.create({
      user: req.user.id,
      userName: req.user.name,
      title,
      category,
      amount: Number(amount),
      notes: notes || '',
    });

    res.status(201).json(expense);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ==============================
// RECORD SALARY PAYMENT (Admin Only)
// ==============================
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

    res.status(201).json(expense);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ==============================
// GET EXPENSES (Scoped by Role)
// ==============================
router.get('/', protect, adminOrModerator, async (req, res) => {
  try {
    let query = {};

    // Moderator can only see their own expenses
    if (req.user.role !== 'admin') {
      query.user = req.user.id;
    }

    const expenses = await Expense.find(query).sort({ createdAt: -1 });
    res.json(expenses);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ==============================
// GET ALL MODERATORS/ADMINS (Admin Only - for Salary Form)
// ==============================
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

module.exports = router;
