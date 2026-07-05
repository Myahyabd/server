const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const axios = require('axios');
require('dotenv').config();

const User = require('./models/User');

async function run() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected!');

    const admin = await User.findOne({ role: 'admin' });
    if (!admin) {
      console.error('No admin user found in database!');
      process.exit(1);
    }
    console.log(`Found Admin: ${admin.name} (${admin.phone || admin.email})`);

    const token = jwt.sign(
      { id: admin._id },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    console.log('Making request to /api/dashboard/analytics...');
    const res = await axios.get('http://localhost:5000/api/dashboard/analytics', {
      headers: { Authorization: `Bearer ${token}` }
    });

    console.log('SUCCESS! Response data:');
    console.log(JSON.stringify(res.data, null, 2));

  } catch (error) {
    console.error('API Request Failed!');
    if (error.response) {
      console.error(`Status: ${error.response.status}`);
      console.error('Data:', error.response.data);
    } else {
      console.error(error);
    }
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

run();
