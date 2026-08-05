const dns = require('dns');
try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
  console.log('Set Node.js DNS servers to Google DNS:', dns.getServers());
} catch (e) {
  console.error('Failed to set DNS servers:', e);
}

const express = require('express');
const mongoose = require('mongoose');

const cors = require('cors');

require('dotenv').config();

const productRoutes = require('./routes/productRoutes');

const authRoutes = require('./routes/authRoutes');

const orderRoutes = require('./routes/orderRoutes');

const uploadRoutes = require('./routes/uploadRoutes');

const dashboardRoutes = require('./routes/dashboardRoutes');

const userRoutes = require('./routes/userRoutes');

const expenseRoutes = require('./routes/expenseRoutes');

const supplierRoutes = require('./routes/supplierRoutes');

const couponRoutes = require('./routes/couponRoutes');

const settingsRoutes = require('./routes/settingsRoutes');
const reviewRoutes = require('./routes/reviewRoutes');
const referralRoutes = require('./routes/referralRoutes');
const moderatorRoutes = require('./routes/moderatorRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');
const mediaRoutes = require('./routes/mediaRoutes');
const contactRoutes = require('./routes/contactRoutes');
const affiliateRoutes = require('./routes/affiliateRoutes');

const app = express();

// MIDDLEWARE
app.use(cors());

app.use(express.json());

// ROUTES
app.get('/', (req, res) => {
  res.send('Backend Running...');
});

app.use('/api/auth', authRoutes);

app.use('/api/products', productRoutes);

app.use('/api/orders', orderRoutes);

app.use('/api/upload', uploadRoutes);

app.use('/api/dashboard', dashboardRoutes);

app.use('/api/users', userRoutes);

// Dynamic Team API for About Page
app.get('/api/team', async (req, res) => {
  try {
    const User = require('./models/User');
    const team = await User.find({
      role: { $in: ['admin', 'moderator'] }
    }).select('-password -otp -otpExpires -isVerified');

    // Filter to only those who have populated at least a name and position
    const activeTeam = team.filter(member => member.position && member.name);

    // Sort by role (admin first), then by position priority (Founder, Admin, etc.)
    activeTeam.sort((a, b) => {
      const roleA = a.role === 'admin' ? 1 : 2;
      const roleB = b.role === 'admin' ? 1 : 2;
      if (roleA !== roleB) return roleA - roleB;

      const posA = (a.position || '').toLowerCase().trim();
      const posB = (b.position || '').toLowerCase().trim();

      const getPosScore = (pos) => {
        if (pos.includes('founder')) return 1;
        if (pos === 'admin') return 2;
        if (pos.includes('senior admin')) return 3;
        if (pos.includes('senior moderator')) return 4;
        if (pos.includes('moderator')) return 5;
        return 99;
      };

      return getPosScore(posA) - getPosScore(posB);
    });

    res.json(activeTeam);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.use('/api/expenses', expenseRoutes);

app.use('/api/suppliers', supplierRoutes);

app.use('/api/coupons', couponRoutes);

app.use('/api/settings', settingsRoutes);

app.use('/api/reviews', reviewRoutes);

app.use('/api/referrals', referralRoutes);

app.use('/api/moderator', moderatorRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/media', mediaRoutes);
app.use('/api/contacts', contactRoutes);
app.use('/api/affiliates', affiliateRoutes);

// MONGODB
const connectDB = () => {
  mongoose
    .connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 5000,
    })
    .then(async () => {
      console.log('MongoDB Connected successfully');
      try {
        // Safely drop the old legacy email unique index if it exists in MongoDB
        await mongoose.connection.db.collection('users').dropIndex('email_1');
        console.log('Successfully dropped old email unique index (email_1)');
      } catch (err) {
        console.log('Note: email_1 index was not dropped (probably already removed or did not exist)');
      }
    })
    .catch(err => {
      console.log('MongoDB connection error:', err.message);
      console.log('Retrying MongoDB connection in 5 seconds...');
      setTimeout(connectDB, 5000);
    });
};

connectDB();

// SERVER
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
