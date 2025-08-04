const mongoose = require('mongoose');

const backtestSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  results: Object, // Save backtest results JSON
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Backtest', backtestSchema);
