// File: backend/models/botStatusModel.js
import mongoose from 'mongoose';

const botStatusSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  isRunning: { type: Boolean, default: false },
  symbol: String,
  amount: Number,
  timeframes: [String],
  startedAt: Date,
}, { timestamps: true });

const BotStatus = mongoose.model('BotStatus', botStatusSchema);
export default BotStatus;
