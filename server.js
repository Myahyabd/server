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

// MONGODB
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB Connected'))
  .catch(err => console.log(err));

// SERVER
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
