const mongoose = require('mongoose');

const botStatusSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  isRunning: { type: Boolean, default: false },
  symbol: String,
  amount: Number,
  timeframes: [String],
  startedAt: Date,
});

module.exports = mongoose.model('BotStatus', botStatusSchema);
