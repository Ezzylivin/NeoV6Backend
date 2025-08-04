// File: backend/server.js
import express from 'express';
import dotenv from 'dotenv';
import connectDB from './config/db.js';

import authRoutes from './routes/authRoutes.js';
import userRoutes from './routes/userRoutes.js';
import botRoutes from './routes/botRoutes.js';
import backtestRoutes from './routes/backtestRoutes.js';
import logRoutes from './routes/logRoutes.js';

dotenv.config();
connectDB();

const app = express();
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/bot', botRoutes);
app.use('/api/backtest', backtestRoutes);
app.use('/api/logs', logRoutes);

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
