import mongoose from "mongoose";
const { Schema, model } = mongoose;

// Individual trade breakdown
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

// Strategy config used in this backtest
const strategyConfigSchema = new Schema(
  {
    name: { type: String, required: true, default: "SMA" },
    parameters: { type: Schema.Types.Mixed },
  },
  { _id: false }
);

// Equity curve for balance-over-time charting
const equityPointSchema = new Schema(
  {
    timestamp: { type: Date, required: true },
    balance: { type: Number, required: true },
  },
  { _id: false }
);

const backtestSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "user", required: true, index: true },
    symbol: { type: String, required: true, trim: true },
    timeframe: { type: String, required: true, trim: true, uppercase: true },

    initialBalance: { type: Number, required: true, min: [0, "Initial balance must be positive"] },
    finalBalance: { type: Number, min: [0, "Final balance must be positive"], default: 0 },
    profit: { type: Number, default: 0 },
    totalTrades: { type: Number, min: [0, "Total trades cannot be negative"], default: 0 },
    candlesTested: { type: Number, required: true, min: [1, "At least one candle must be tested"] },

    strategy: strategyConfigSchema,
    tradeBreakdown: [tradeResultSchema],
    equityCurve: [equityPointSchema],
    metrics: { type: Schema.Types.Mixed }, // full snapshot for analysis

    // Persisted risk/TP/SL for auditing
    risk: { type: String, enum: ["Low", "Medium", "High"], default: "Medium" },
    takeProfit: { type: Number, default: null },
    stopLoss: { type: Number, default: null },

    // Realism / advanced backtest options used
    realismConfig: {
      useNews: { type: Boolean, default: true },
      useSlippage: { type: Boolean, default: true },
      useSpread: { type: Boolean, default: true },
      useRandomEvents: { type: Boolean, default: true },
      slippageBps: { type: Number, default: 5 },
      spreadPct: { type: Number, default: 0.1 },
    },

    // Track which position side was tested
    positionSide: { type: String, enum: ["long", "short", "both"], default: "both" },

    // Extra trade configuration for audit / reproducibility
    tradeConfig: { type: Schema.Types.Mixed },

  },
  { timestamps: true }
);

// Compute total profit & final balance
backtestSchema.pre("save", function (next) {
  if (Array.isArray(this.tradeBreakdown)) {
    const totalProfit = this.tradeBreakdown.reduce((sum, trade) => sum + (trade.profit || 0), 0);
    this.totalTrades = this.tradeBreakdown.length;
    if (!isNaN(totalProfit)) {
      this.profit = totalProfit;
      this.finalBalance = this.initialBalance + totalProfit;
    }
  }

  if (isNaN(this.profit)) this.profit = 0;
  if (isNaN(this.finalBalance)) this.finalBalance = this.initialBalance;

  next();
});

export default model("backtest", backtestSchema);
