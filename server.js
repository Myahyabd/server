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

app.use('/api/expenses', expenseRoutes);

app.use('/api/suppliers', supplierRoutes);

app.use('/api/coupons', couponRoutes);

app.use('/api/settings', settingsRoutes);

app.use('/api/reviews', reviewRoutes);

app.use('/api/referrals', referralRoutes);

app.use('/api/moderator', moderatorRoutes);
app.use('/api/analytics', analyticsRoutes);

// MONGODB
mongoose
  .connect(process.env.MONGO_URI)
  .then(async () => {
    console.log('MongoDB Connected');
    try {
      // Safely drop the old legacy email unique index if it exists in MongoDB
      await mongoose.connection.db.collection('users').dropIndex('email_1');
      console.log('Successfully dropped old email unique index (email_1)');
    } catch (err) {
      console.log('Note: email_1 index was not dropped (probably already removed or did not exist)');
    }
  })
  .catch(err => console.log(err));

// SERVER
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
