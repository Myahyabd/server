const mongoose = require('mongoose');
require('dotenv').config();

const User = require('./models/User');

async function run() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected! Querying users...');

    const users = await User.find({});
    console.log(`Found ${users.length} users in the database:\n`);

    users.forEach((u, i) => {
      console.log(`${i+1}. Name: "${u.name}", Role: "${u.role}", Referral: "${u.referralCode}", Phone: "${u.phone}", Email: "${u.email}"`);
    });

  } catch (error) {
    console.error('Error querying users:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected.');
    process.exit(0);
  }
}

run();
