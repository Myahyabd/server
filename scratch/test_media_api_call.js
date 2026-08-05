const axios = require('axios');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('../models/User');
const jwt = require('jsonwebtoken');

dotenv.config();

async function run() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    const admin = await User.findOne({ phone: '01737224140' });
    if (!admin) {
      console.log('Admin user not found!');
      return;
    }

    // Generate JWT token for testing
    const token = jwt.sign({ id: admin._id }, process.env.JWT_SECRET, {
      expiresIn: '30d',
    });
    console.log('Generated token:', token.substring(0, 20) + '...');

    console.log('Sending request to http://localhost:5000/api/media...');
    const res = await axios.get('http://localhost:5000/api/media', {
      headers: { Authorization: `Bearer ${token}` }
    });

    console.log('STATUS:', res.status);
    console.log('Response items count:', res.data.length);
    console.log('First item:', res.data[0]);

  } catch (err) {
    console.error('API Call failed:', err.response ? {
      status: err.response.status,
      data: err.response.data
    } : err.message);
  } finally {
    await mongoose.disconnect();
  }
}
run();
