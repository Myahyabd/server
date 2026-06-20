const express = require('express');

const router = express.Router();

const User = require('../models/User');

const protect = require('../middleware/authMiddleware');

const { adminOnly } = require('../middleware/roleMiddleware');

// GET ALL USERS
router.get(
  '/',
  protect,
  adminOnly,

  async (req, res) => {
    try {
      const users = await User.find().select('-password');

      res.json(users);
    } catch (error) {
      res.status(500).json({
        message: error.message,
      });
    }
  },
);

// DELETE USER
router.delete(
  '/:id',

  protect,
  adminOnly,

  async (req, res) => {
    try {
      const user = await User.findById(req.params.id);

      if (!user) {
        return res.status(404).json({
          message: 'User not found',
        });
      }

      await user.deleteOne();

      res.json({
        message: 'User deleted',
      });
    } catch (error) {
      res.status(500).json({
        message: error.message,
      });
    }
  },
);

// MAKE ADMIN
router.put(
  '/:id/admin',

  protect,
  adminOnly,

  async (req, res) => {
    try {
      const user = await User.findById(req.params.id);

      if (!user) {
        return res.status(404).json({
          message: 'User not found',
        });
      }

      user.role = 'admin';

      await user.save();

      res.json({
        message: 'User promoted to admin',
      });
    } catch (error) {
      res.status(500).json({
        message: error.message,
      });
    }
  },
);

router.put('/:id/moderator', protect, adminOnly, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        message: 'User not found',
      });
    }

    user.role = 'moderator';

    await user.save();

    res.json({
      message: 'User promoted to moderator',
    });
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
});

// REMOVE MODERATOR
router.put('/:id/remove-moderator', protect, adminOnly, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        message: 'User not found',
      });
    }

    if (user.role !== 'moderator') {
      return res.status(400).json({
        message: 'Only moderators can be changed back to customer',
      });
    }

    user.role = 'customer';

    await user.save();

    res.json({
      message: 'Moderator removed successfully',
    });
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
});

module.exports = router;
