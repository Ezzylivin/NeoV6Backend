// File: backend/models/botStatus.js
import mongoose from 'mongoose';

const botStatusSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  isRunning: { type: Boolean, default: false },
  symbol: String,
  amount: Number,
  timeframes: [String],
  startedAt: Date,
});

export default mongoose.model('BotStatus', botStatusSchema);
