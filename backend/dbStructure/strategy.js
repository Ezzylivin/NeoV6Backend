import mongoose from "mongoose";

const strategySchema = new mongoose.Schema({
  userId: { type: String, required: true },

  // Strategy metadata
  name: { type: String, default: "Default Strategy" },
  description: { type: String, default: "" },
  isActive: { type: Boolean, default: false },

  // Parameters used in backtests and live trading
  params: {
    symbol: { type: String, default: "BTCUSDT" },
    timeframe: { type: String, default: "1h" },
    initialBalance: { type: Number, default: 1000 },
    strategyType: { type: String, default: "SMA" }, // SMA, EMA, RSI, MACD, etc.
    risk: { type: String, default: "Medium" }, // Low, Medium, High
    stopLoss: { type: Number, default: 0.02 }, // 2% default
    takeProfit: { type: Number, default: 0.05 }, // 5% default

    // Optional batch/backtest parameters
    batchParams: {
      stopLossOptions: [Number],
      takeProfitOptions: [Number],
      intervalOptions: [String],
    },

    // Realism / advanced backtest options
    realism: {
      useNews: { type: Boolean, default: true },
      useSlippage: { type: Boolean, default: true },
      useSpread: { type: Boolean, default: true },
      useRandomEvents: { type: Boolean, default: true },
      slippageBps: { type: Number, default: 5 }, // basis points
      spreadPct: { type: Number, default: 0.1 }, // %
    },
  },

  // Optional stats tracking from backtests/live trading
  stats: {
    lastProfit: Number,
    lastEquity: Number,
    winRate: Number,
    tradesCount: Number,
    sharpeRatio: Number,
    maxDrawdown: Number,
    cagr: Number,
    profitFactor: Number,
  },

  // Optional: last backtest metrics for quick reference in UI
  lastBacktestMetrics: {
    netProfit: Number,
    winRate: Number,
    maxDrawdown: Number,
    sharpeRatio: Number,
    cagr: Number,
    profitFactor: Number,
    tradesCount: Number,
  },

}, { timestamps: true });

export default mongoose.model("Strategy", strategySchema);
