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
  name: { type: String, default: "Default Strategy", trim: true, required: true },
  description: { type: String, default: "", trim: true },
  isActive: { type: Boolean, default: false },
  params: {
    symbol: { type: String, default: "BTCUSDT", trim: true, uppercase: true },
    timeframe: { type: String, default: "1h" },
    initialBalance: { type: Number, default: 1000, min: 1 },
    strategyType: { type: String, default: "SMA" }, // e.g., SMA, EMA, RSI
    risk: { type: String, default: "Medium", enum: ["Low", "Medium", "High"] },
    stopLoss: { type: Number, default: 0.02, min: 0, max: 1 },
    takeProfit: { type: Number, default: 0.05, min: 0, max: 5 },
    batchParams: {
      stopLossOptions: [Number],
      takeProfitOptions: [Number],
      intervalOptions: [String],
    },
    realism: {
      useNews: { type: Boolean, default: false },
      useSlippage: { type: Boolean, default: true },
      useSpread: { type: Boolean, default: true },
      useRandomEvents: { type: Boolean, default: false },
      slippageBps: { type: Number, default: 5, min: 0 },
      spreadPct: { type: Number, default: 0.1, min: 0 },
    },
  },
  // Consolidated metrics from the last backtest for quick reference
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

export default model("Strategy", strategySchema);
