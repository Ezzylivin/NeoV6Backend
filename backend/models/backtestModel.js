import mongoose from 'mongoose';

const backtestSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  result: mongoose.Schema.Types.Mixed,
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model('Backtest', backtestSchema);
