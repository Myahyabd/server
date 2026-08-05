const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('../models/User');

dotenv.config();

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  const admin = await User.findOne({ role: 'admin' });
  console.log('Admin user found:', admin?.name, admin?.phone);
  await mongoose.disconnect();
}
run();
