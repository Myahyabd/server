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

// GET PUBLIC TEAM MEMBERS SORTED BY HIERARCHY
router.get('/team', async (req, res) => {
  try {
    const team = await User.find({
      role: { $in: ['admin', 'moderator'] }
    }).select('-password -otp -otpExpires -isVerified');

    // Filter to only those who have populated at least a name and position
    const activeTeam = team.filter(member => member.position && member.name);

    // Sort by role (admin first), then by position priority (founder, admin, senior admin, senior moderator, moderator)
    activeTeam.sort((a, b) => {
      const roleA = a.role === 'admin' ? 1 : 2;
      const roleB = b.role === 'admin' ? 1 : 2;
      if (roleA !== roleB) {
        return roleA - roleB;
      }

      const posA = (a.position || '').toLowerCase().trim();
      const posB = (b.position || '').toLowerCase().trim();

      const getPosScore = (pos) => {
        if (pos.includes('founder')) return 1;
        if (pos === 'admin') return 2;
        if (pos.includes('senior admin')) return 3;
        if (pos.includes('senior moderator')) return 4;
        if (pos.includes('moderator')) return 5;
        return 99; // custom positions
      };

      return getPosScore(posA) - getPosScore(posB);
    });

    res.json(activeTeam);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET CURRENT USER PROFILE
router.get('/profile', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Generate referralCode on-the-fly for existing users if missing
    if (!user.referralCode) {
      let code = '';
      let exists = true;
      while (exists) {
        const suffix = Math.floor(100000 + Math.random() * 900000);
        code = `NUS-${suffix}`;
        const duplicate = await User.findOne({ referralCode: code });
        if (!duplicate) exists = false;
      }
      user.referralCode = code;
      await user.save();
    }

    res.json(user);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// UPDATE CURRENT USER PROFILE
router.put('/profile', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const allowedFields = [
      'name',
      'profilePhoto',
      'position',
      'shortBio',
      'fullBio',
      'responsibilities',
      'joinedNusHaat',
      'joiningReason',
      'skills',
      'facebookLink',
      'linkedinLink',
      'githubLink',
      'websiteLink',
    ];

    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        user[field] = req.body[field];
      }
    });

    await user.save();
    res.json({ message: 'Profile updated successfully', user });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ADMIN EDIT/MODERATE OTHER USERS' PROFILE
router.put('/:id/profile', protect, adminOnly, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const allowedFields = [
      'name',
      'profilePhoto',
      'position',
      'shortBio',
      'fullBio',
      'responsibilities',
      'joinedNusHaat',
      'joiningReason',
      'skills',
      'facebookLink',
      'linkedinLink',
      'githubLink',
      'websiteLink',
    ];

    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        user[field] = req.body[field];
      }
    });

    await user.save();
    res.json({ message: 'User profile updated successfully', user });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
