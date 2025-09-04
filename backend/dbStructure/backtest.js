// File: backend/dbStructure/backtest.js
import mongoose from "mongoose";
const { Schema, model } = mongoose;

const tradeResultSchema = new Schema(
  {
    entryTime: Date,
    exitTime: Date,
    entryPrice: Number,
    exitPrice: Number,
    position: { type: String, enum: ["long", "short"] },
    profit: { type: Number, default: 0 },
    duration: Number,
    result: { type: String, enum: ["win", "loss", "breakeven"] },
  },
  { _id: false }
);

const strategyConfigSchema = new Schema(
  {
    name: { type: String, required: true, default: "SMA" },
    parameters: { type: Schema.Types.Mixed },
  },
  { _id: false }
);

const backtestSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "user", required: true, index: true },
    symbol: { type: String, required: true, trim: true },           // ✅ store symbol
    timeframe: { type: String, required: true, trim: true, uppercase: true },
    initialBalance: { type: Number, required: true, min: [0, "Initial balance must be positive"] },
    finalBalance: { type: Number, min: [0, "Final balance must be positive"], default: 0 },
    profit: { type: Number, default: 0 },
    totalTrades: { type: Number, min: [0, "Total trades cannot be negative"], default: 0 },
    candlesTested: { type: Number, required: true, min: [1, "At least one candle must be tested"] },
    strategy: strategyConfigSchema,
    tradeBreakdown: [tradeResultSchema],
    metrics: { type: Schema.Types.Mixed }, // keep full metrics snapshot

    // ✅ Persisted risk/TP/SL so you can review later and ensure they were applied
    risk: { type: String, enum: ["Low", "Medium", "High"], default: "Medium" },
    takeProfit: { type: Number, default: null }, // percent (nullable)
    stopLoss: { type: Number, default: null },   // percent (nullable)
  },
  { timestamps: true }
);

backtestSchema.pre("save", function (next) {
  if (Array.isArray(this.tradeBreakdown)) {
    const totalProfit = this.tradeBreakdown.reduce((sum, trade) => sum + (trade.profit || 0), 0);
    this.totalTrades = this.tradeBreakdown.length;
    if (!isNaN(totalProfit)) {
      this.profit = totalProfit;
      this.finalBalance = this.initialBalance + totalProfit;
    }
  }

  // Sanitize NaNs
  if (isNaN(this.profit)) this.profit = 0;
  if (isNaN(this.finalBalance)) this.finalBalance = this.initialBalance;

  next();
});

export default model("backtest", backtestSchema);
