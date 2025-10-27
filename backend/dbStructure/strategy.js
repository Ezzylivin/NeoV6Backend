// File: backend/dbStructure/strategy.js

import mongoose from "mongoose";
const { Schema, model } = mongoose;

const strategySchema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  code: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
  },
  name: { type: String, trim: true, required: true },
  description: { type: String, default: "", trim: true },
  isActive: { type: Boolean, default: false },
  
  // ✅ FIXED: Changed to a flexible 'Mixed' type.
  // This allows any parameter combination to be saved, which is essential
  // for supporting different types of trading strategies.
  params: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },

  lastBacktestMetrics: {
    netProfit: Number,
    winRate: Number,
    maxDrawdown: Number,
    sharpeRatio: Number,
    cagr: Number,
    profitFactor: Number,
    tradesCount: Number,
    runId: { type: Schema.Types.ObjectId, ref: 'Backtest' },
    runDate: Date,
  },
}, { timestamps: true });

// Ensures no two strategies from the same user can have the same code.
strategySchema.index({ code: 1, userId: 1 }, { unique: true });

export default model("Strategy", strategySchema);
