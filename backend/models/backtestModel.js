// File: backend/models/backtestModel.js
import mongoose from 'mongoose';

const backtestSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  timeframe: { type: String, required: true },
  initialBalance: Number,
  finalBalance: Number,
  profit: Number,
  totalTrades: Number,
  candlesTested: Number,
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model('Backtest', backtestSchema);
