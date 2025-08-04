require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');

const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const botRoutes = require('./routes/botRoutes');
const backtestRoutes = require('./routes/backtestRoutes');
const logRoutes = require('./routes/logRoutes');

const app = express();

connectDB();

app.use(cors());
app.use(express.json());

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/bot', botRoutes);
app.use('/api/backtest', backtestRoutes);
app.use('/api/logs', logRoutes);

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
