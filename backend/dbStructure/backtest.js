// File: backend/dbStructure/backtest.js
import mongoose from 'mongoose';

const backtestSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  timeframe: { type: String, required: true },
  initialBalance: { type: Number, required: true },
  finalBalance: { type: Number, required: true },
  profit: { type: Number, required: true },
  totalTrades: { type: Number, required: true },
  candlesTested: { type: Number, required: true },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model('Backtest', backtestSchema);
