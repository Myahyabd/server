const User = require('../models/User');

const adminOnly = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    res.status(401).json({
      message: 'Not authorized as admin',
    });
  }
};

const adminOrModerator = (req, res, next) => {
  if (req.user.role === 'admin' || req.user.role === 'moderator') {
    next();
  } else {
    res.status(403).json({
      message: 'Access denied',
    });
  }
};

module.exports = {
  adminOnly,
  adminOrModerator,
};
