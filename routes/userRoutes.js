const express = require('express');

const router = express.Router();

const User = require('../models/User');
const Order = require('../models/Order');

const protect = require('../middleware/authMiddleware');

const { adminOnly } = require('../middleware/roleMiddleware');

router.get(
  '/',
  protect,
  adminOnly,

  async (req, res) => {
    try {
      const users = await User.find().select('-password');
      
      const resellers = users.filter(u => u.role === 'reseller');
      const resellerOrderCounts = await Promise.all(resellers.map(async (r) => {
        const count = await Order.countDocuments({
          $or: [
            { moderator: r._id },
            { referralOwner: r._id }
          ]
        });
        return {
          userId: r._id.toString(),
          count
        };
      }));
      
      resellerOrderCounts.sort((a, b) => b.count - a.count);
      
      const usersWithStats = users.map(user => {
        const userObj = user.toObject();
        if (userObj.role === 'reseller') {
          const stat = resellerOrderCounts.find(s => s.userId === userObj._id.toString());
          const orderCount = stat ? stat.count : 0;
          const rankIndex = resellerOrderCounts.findIndex(s => s.userId === userObj._id.toString());
          const rank = rankIndex !== -1 ? rankIndex + 1 : resellerOrderCounts.length;
          
          userObj.resellerRank = `#${rank}`;
          userObj.resellerOrders = orderCount;
        }
        return userObj;
      });

      res.json(usersWithStats);
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

    user.role = 'reseller';
    user.isModeratorPending = false;

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

// REJECT PENDING MODERATOR
router.put('/:id/reject-moderator', protect, adminOnly, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        message: 'User not found',
      });
    }

    user.isModeratorPending = false;
    await user.save();

    res.json({
      message: 'Reseller request rejected successfully',
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

    if (user.role !== 'moderator' && user.role !== 'reseller') {
      return res.status(400).json({
        message: 'Only moderators and resellers can be changed back to customer',
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

    if (req.body.phone !== undefined) {
      const existingPhone = await User.findOne({ phone: req.body.phone });
      if (existingPhone && existingPhone._id.toString() !== user._id.toString()) {
        return res.status(400).json({ message: 'Phone number is already in use' });
      }
      user.phone = req.body.phone;
    }

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

// APPLY TO BE A RESELLER (MODERATOR)
router.post('/apply-reseller', protect, async (req, res) => {
  try {
    const { email, address } = req.body;
    if (!email || !address) {
      return res.status(400).json({ message: 'Email and Address are required' });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (user.role === 'moderator' || user.role === 'admin') {
      return res.status(400).json({ message: 'You are already a staff member' });
    }

    const existingEmail = await User.findOne({ email });
    if (existingEmail && existingEmail._id.toString() !== user._id.toString()) {
      return res.status(400).json({ message: 'Email address is already in use' });
    }

    user.email = email;
    user.address = address;
    user.isModeratorPending = true;

    await user.save();

    res.json({
      message: 'Reseller application submitted successfully',
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        address: user.address,
        isModeratorPending: user.isModeratorPending
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET RESELLER DASHBOARD STATS & RANK
router.get('/reseller/stats', protect, async (req, res) => {
  try {
    if (req.user.role !== 'reseller' && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    const userId = req.user._id.toString();
    
    // Calculate rank among all resellers
    const resellers = await User.find({ role: 'reseller' }).select('_id resellerId name');
    const resellerOrdersCounts = await Promise.all(resellers.map(async (r) => {
      const orderCount = await Order.countDocuments({
        $or: [
          { moderator: r._id },
          { referralOwner: r._id }
        ]
      });
      return {
        userId: r._id.toString(),
        resellerId: r.resellerId,
        name: r.name,
        orderCount
      };
    }));
    
    // Sort by orderCount descending
    resellerOrdersCounts.sort((a, b) => b.orderCount - a.orderCount);
    
    // Find current user's index
    const myRankIndex = resellerOrdersCounts.findIndex(r => r.userId === userId);
    const rank = myRankIndex !== -1 ? myRankIndex + 1 : resellers.length;
    const totalResellers = resellers.length;
    
    // Let's fetch current reseller's order counts by status
    const totalOrders = await Order.countDocuments({
      $or: [
        { moderator: req.user._id },
        { referralOwner: req.user._id }
      ]
    });
    
    const pendingOrders = await Order.countDocuments({
      $or: [
        { moderator: req.user._id },
        { referralOwner: req.user._id }
      ],
      status: { $in: ['Pending', 'Processing', 'Hold'] }
    });
    
    const deliveredOrders = await Order.countDocuments({
      $or: [
        { moderator: req.user._id },
        { referralOwner: req.user._id }
      ],
      status: 'Delivered'
    });
    
    const cancelledOrders = await Order.countDocuments({
      $or: [
        { moderator: req.user._id },
        { referralOwner: req.user._id }
      ],
      status: { $in: ['Cancelled', 'Failed', 'Returned'] }
    });
    
    res.json({
      resellerId: req.user.resellerId || 'N/A',
      rank: `#${rank}`,
      totalResellers,
      orderCount: totalOrders,
      stats: {
        totalOrders,
        pendingOrders,
        deliveredOrders,
        cancelledOrders
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
