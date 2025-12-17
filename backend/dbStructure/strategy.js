// File: backend/dbStructure/strategy.js
// 🚀 UPGRADE: v3.0 - Wallet & Combo Ready
// 🛠 Fixes: "Cast to ObjectId failed" & supports Combo Configs

import mongoose from "mongoose";
const { Schema, model } = mongoose;

const strategySchema = new Schema({
  // 🚀 CRITICAL FIX: Changed to String to allow "0x..." Wallet Addresses
  userId: {
    type: String, 
    required: true,
    index: true
  },

  name: { type: String, trim: true, required: true },
  description: { type: String, default: "", trim: true },
  symbol: { type: String, default: "BTC-USD" },
  timeframe: { type: String, default: "1h" },

  // 🚀 UPGRADE: Flexible Configuration for Single OR Combo Strategies
  // This matches the payload your Frontend is sending.
  config: {
    // List of strategies involved (e.g. SMA + RSI)
    strategies: [{
      code: { type: String, required: true },
      params: { type: Map, of: Number } 
    }],
    
    // Rules for combining them (e.g. "AND", "OR")
    comboConfig: {
      combinationRule: { type: String, enum: ['AND', 'OR', 'MAJORITY'], default: 'AND' },
      minVotes: Number
    }
  },

  // Execution Settings (Risk, SL/TP)
  execution: {
    riskPercentage: { type: Number, default: 1 },
    riskManagementMode: { type: String, enum: ['static', 'dynamic'], default: 'static' },
    maxPyramiding: { type: Number, default: 1 },
    sl_tp_settings: {
      stopLossPct: Number,
      takeProfitPct: Number,
      trailingStop: Boolean
    }
  },

  // Performance Tracking
  lastBacktestMetrics: {
    netProfit: Number,
    winRate: Number,
    maxDrawdown: Number,
    sharpeRatio: Number,
    tradesCount: Number,
    runDate: Date,
  },

  isPublic: { type: Boolean, default: false },
  isActive: { type: Boolean, default: false }

}, { timestamps: true });

// Index for fast lookups by user
strategySchema.index({ userId: 1, name: 1 });

export default model("Strategy", strategySchema);
