const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const protect = require('../middleware/authMiddleware');
const { sendSMS } = require('../config/smsHelper');

const router = express.Router();

const validatePassword = (password) => {
  const regex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*])[A-Za-z\d!@#$%^&*]{8,}$/;
  return regex.test(password);
};

// 1. SEND OTP FOR REGISTRATION
router.post('/send-otp', async (req, res) => {
  try {
    const { phone } = req.body;

    if (!phone) {
      return res.status(400).json({ message: 'Phone number is required' });
    }

    // Check if user already exists and is verified
    const existingUser = await User.findOne({ phone });
    if (existingUser && existingUser.isVerified) {
      return res.status(400).json({ message: 'Phone number already registered' });
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes validity

    let user = existingUser;
    if (!user) {
      // Create a temporary unverified user
      user = new User({
        name: 'Guest',
        phone,
        password: 'temp_password_hash', // Temporary password placeholder
        isVerified: false,
      });
    }

    user.otp = otp;
    user.otpExpires = otpExpires;
    await user.save();

    // Send OTP SMS
    const message = `Your Nus Haat verification code is ${otp}. Valid for 10 minutes.`;
    await sendSMS(phone, message);

    res.status(200).json({ message: 'OTP sent successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// 2. VERIFY OTP FOR REGISTRATION
router.post('/verify-otp', async (req, res) => {
  try {
    const { phone, otp } = req.body;

    if (!phone || !otp) {
      return res.status(400).json({ message: 'Phone and OTP are required' });
    }

    const user = await User.findOne({ phone });
    if (!user) {
      return res.status(400).json({ message: 'Invalid request' });
    }

    // Check OTP validity
    if (!user.otp || user.otp !== otp || new Date() > user.otpExpires) {
      return res.status(400).json({ message: 'Invalid or expired OTP' });
    }

    // Don't mark isVerified as true yet, or mark it so they can register
    user.isVerified = true;
    user.otp = null; // Clear OTP once verified
    user.otpExpires = null;
    await user.save();

    res.status(200).json({ message: 'OTP verified successfully. You can now complete registration.' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// 3. COMPLETE REGISTRATION (SAVE NAME AND PASSWORD)
router.post('/register', async (req, res) => {
  try {
    const { name, phone, password } = req.body;

    if (!name || !phone || !password) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    if (!validatePassword(password)) {
      return res.status(400).json({
        message: 'Password must be at least 8 characters long, and contain at least one uppercase letter, one lowercase letter, one number, and one special character (!@#$%^&*)',
      });
    }

    const user = await User.findOne({ phone });
    if (!user) {
      return res.status(400).json({ message: 'Please verify phone number first' });
    }

    if (!user.isVerified) {
      return res.status(400).json({ message: 'Phone number is not verified' });
    }

    // Update user name and hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    user.name = name;
    user.password = hashedPassword;
    await user.save();

    res.status(201).json({ message: 'Registration completed successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// 4. PHONE LOGIN
router.post('/login', async (req, res) => {
  try {
    const { phone, password } = req.body;

    if (!phone || !password) {
      return res.status(400).json({ message: 'Phone and password are required' });
    }

    // Find User (supports both phone and legacy email)
    const user = await User.findOne({
      $or: [
        { phone: phone },
        { email: phone }
      ]
    });

    if (!user) {
      return res.status(400).json({ message: 'User not registered' });
    }

    if (user.role === 'customer' && !user.isVerified) {
      return res.status(400).json({ message: 'Phone number not verified' });
    }

    // Check Password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Wrong password' });
    }

    // Create Token
    const token = jwt.sign(
      { id: user._id },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Response
    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        phone: user.phone,
        role: user.role,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// 5. SEND OTP FOR PASSWORD RESET
router.post('/forgot-password', async (req, res) => {
  try {
    const { phone } = req.body;

    if (!phone) {
      return res.status(400).json({ message: 'Phone number is required' });
    }

    const user = await User.findOne({ phone });
    if (!user || !user.isVerified) {
      return res.status(400).json({ message: 'Phone number not registered' });
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    user.otp = otp;
    user.otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
    await user.save();

    // Send SMS
    const message = `Your Nus Haat password reset verification code is ${otp}. Valid for 10 minutes.`;
    await sendSMS(phone, message);

    res.status(200).json({ message: 'Password reset OTP sent successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// 6. RESET PASSWORD WITH OTP
router.post('/reset-password', async (req, res) => {
  try {
    const { phone, otp, newPassword } = req.body;

    if (!phone || !otp || !newPassword) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    if (!validatePassword(newPassword)) {
      return res.status(400).json({
        message: 'Password must be at least 8 characters long, and contain at least one uppercase letter, one lowercase letter, one number, and one special character (!@#$%^&*)',
      });
    }

    const user = await User.findOne({ phone });
    if (!user) {
      return res.status(400).json({ message: 'User not found' });
    }

    // Check OTP
    if (!user.otp || user.otp !== otp || new Date() > user.otpExpires) {
      return res.status(400).json({ message: 'Invalid or expired OTP' });
    }

    // Hash and Save New Password
    user.password = await bcrypt.hash(newPassword, 10);
    user.otp = null;
    user.otpExpires = null;
    await user.save();

    res.status(200).json({ message: 'Password reset successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// 7. GET ME (PROTECTED ROUTE)
router.get('/me', protect, (req, res) => {
  res.json({
    message: 'Protected Route Working',
    user: req.user,
  });
});

module.exports = router;
