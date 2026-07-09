const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const protect = require('../middleware/authMiddleware');
const { sendSMS } = require('../config/smsHelper');
const ActionLog = require('../models/ActionLog');

const router = express.Router();

const validatePassword = (password) => {
  return password && password.length >= 6;
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
    const { name, phone, password, email } = req.body;

    if (!name || !phone || !password) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    if (!validatePassword(password)) {
      return res.status(400).json({
        message: 'Password must be at least 6 characters.',
      });
    }

    const user = await User.findOne({ phone });
    if (!user) {
      return res.status(400).json({ message: 'Please verify phone number first' });
    }

    if (!user.isVerified) {
      return res.status(400).json({ message: 'Phone number is not verified' });
    }

    if (email) {
      const existingEmail = await User.findOne({ email });
      if (existingEmail && existingEmail._id.toString() !== user._id.toString()) {
        return res.status(400).json({ message: 'Email address already registered' });
      }
      user.email = email;
    } else {
      user.email = undefined;
    }

    // Update user name and hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    user.name = name;
    user.password = hashedPassword;
    await user.save();

    try {
      await ActionLog.create({
        type: 'register',
        user: user._id,
        sessionToken: req.body.sessionToken || 'direct_register_session'
      });
    } catch (err) {
      console.error('Failed to log registration action:', err);
    }

    // Create Token for auto-login
    const token = jwt.sign(
      { id: user._id },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      message: 'Registration completed successfully',
      token,
      user: {
        id: user._id,
        name: user.name,
        phone: user.phone,
        email: user.email,
        role: user.role,
      },
    });
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

    try {
      await ActionLog.create({
        type: 'login',
        user: user._id,
        sessionToken: req.body.sessionToken || 'direct_login_session'
      });
    } catch (err) {
      console.error('Failed to log login action:', err);
    }

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
        message: 'Password must be at least 6 characters.',
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

// 8. TEMPORARY: SET PHONE FOR LEGACY EMAIL USER
router.post('/set-admin-phone', async (req, res) => {
  try {
    const { email, phone, secret } = req.body;
    
    // Safety check using JWT_SECRET to prevent unauthorized calls
    if (secret !== process.env.JWT_SECRET) {
      return res.status(401).json({ message: 'Unauthorized secret' });
    }

    if (!email || !phone) {
      return res.status(400).json({ message: 'Email and phone are required' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: 'User with this email not found' });
    }

    user.phone = phone;
    user.isVerified = true; // Verify so they can login immediately
    await user.save();

    res.json({ message: `Successfully updated phone number of ${user.name} to ${phone}` });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// CHANGE PASSWORD (Logged In User)
router.put('/change-password', protect, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Current password and new password are required' });
    }

    if (!validatePassword(newPassword)) {
      return res.status(400).json({
        message: 'Password must be at least 6 characters.',
      });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Incorrect current password' });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    res.json({ message: 'Password updated successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
