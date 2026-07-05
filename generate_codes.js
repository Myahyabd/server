const mongoose = require('mongoose');
require('dotenv').config();
const User = require('./models/User');

async function migrate() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected!');

    const users = await User.find({ referralCode: { $exists: false } });
    console.log(`Found ${users.length} users without referral codes.`);

    let updatedCount = 0;
    for (const user of users) {
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
      console.log(`Updated user ${user.name || user.email} with code ${code}`);
      updatedCount++;
    }

    const nullUsers = await User.find({ referralCode: null });
    console.log(`Found ${nullUsers.length} users with null referral codes.`);
    for (const user of nullUsers) {
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
      console.log(`Updated user ${user.name || user.email} with code ${code}`);
      updatedCount++;
    }

    console.log(`Migration complete. ${updatedCount} users updated.`);
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}

migrate();
