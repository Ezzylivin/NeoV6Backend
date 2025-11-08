import mongoose from "mongoose";
const { Schema, model } = mongoose;

// Individual trade breakdown
const tradeResultSchema = new Schema({
  entryTime: { type: Date, required: true },
  exitTime: { type: Date },
  entryPrice: { type: Number, required: true, min: 0 },
  exitPrice: { type: Number, min: 0 },
  position: {
    type: String,
    enum: ["long", "short"],
    required: true
  },
  size: { type: Number, required: true, min: 0 },
  profit: { type: Number, default: 0 },
  commission: { type: Number, default: 0 },
  exitCommission: { type: Number, default: 0 },
  duration: { type: Number }, // milliseconds
  result: {
    type: String,
    enum: ["win", "loss", "breakeven", "open"],
    default: "open"
  },
}, { _id: false });

// Strategy config used in this backtest
const strategyConfigSchema = new Schema({
  name: { type: String, required: true },
  type: { type: String, required: true }, // SMA, EMA, RSI, etc.
  parameters: {
    type: Schema.Types.Mixed,
    validate: {
      validator: function(params) {
        return typeof params === 'object' && params !== null;
      },
      message: 'Parameters must be a valid object'
    }
  },
}, { _id: false });

// Equity curve for balance-over-time charting
const equityPointSchema = new Schema({
  timestamp: { type: Date, required: true },
  balance: { type: Number, required: true, min: 0 },
}, { _id: false });

// Enhanced metrics schema
const metricsSchema = new Schema({
  totalReturn: { type: Number, default: 0 }, // percentage
  winRate: { type: Number, default: 0, min: 0, max: 100 }, // percentage
  totalTrades: { type: Number, default: 0, min: 0 },
  winningTrades: { type: Number, default: 0, min: 0 },
  losingTrades: { type: Number, default: 0, min: 0 },
  maxDrawdown: { type: Number, default: 0, min: 0, max: 100 }, // percentage
  sharpeRatio: { type: Number, default: 0 },
  profitFactor: { type: Number, default: 0, min: 0 },
  averageWin: { type: Number, default: 0 },
  averageLoss: { type: Number, default: 0 },
  largestWin: { type: Number, default: 0 },
  largestLoss: { type: Number, default: 0 },
  consecutiveWins: { type: Number, default: 0 },
  consecutiveLosses: { type: Number, default: 0 },
  cagr: { type: Number, default: 0 }, // Compound Annual Growth Rate
  volatility: { type: Number, default: 0 },
  maxRunup: { type: Number, default: 0 }
}, { _id: false });

const backtestSchema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true
  },
  symbol: {
    type: String,
    required: true,
    trim: true,
    uppercase: true,
    index: true
  },
  timeframe: {
    type: String,
    required: true,
    trim: true,
    lowercase: true, // FIX: Ensures case-insensitivity
    enum: ['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w'],
    default: '1h'
  },
  initialBalance: {
    type: Number,
    required: true,
    min: [1, "Initial balance must be positive"]
  },
  finalBalance: {
    type: Number,
    min: [0, "Final balance cannot be negative"],
    default: 0
  },
  profit: { type: Number, default: 0 },
  totalTrades: {
    type: Number,
    min: [0, "Total trades cannot be negative"],
    default: 0
  },
  candlesTested: {
    type: Number,
    required: true,
    min: [1, "At least one candle must be tested"]
  },
  strategy: {
    type: strategyConfigSchema,
    required: true
  },
  tradeBreakdown: [tradeResultSchema],
  equityCurve: [equityPointSchema],

  // --- 💡 START OF FIX ---
  // Add the missing field for the chart replay
  candleData: { type: [Object] },
  // --- 💡 END OF FIX ---

  metrics: metricsSchema,
  risk: {
    type: String,
    enum: ["Low", "Medium", "High"],
    default: "Medium"
  },
  takeProfit: {
    type: Number,
    min: 0,
    max: 1,
    default: null
  },
  stopLoss: {
    type: Number,
    min: 0,
    max: 1,
    default: null
  },
  realismConfig: {
    useNews: { type: Boolean, default: false },
    useSlippage: { type: Boolean, default: true },
    useSpread: { type: Boolean, default: true },
    useCommission: { type: Boolean, default: true },
    useRandomEvents: { type: Boolean, default: false },
    slippageBps: { type: Number, default: 5, min: 0, max: 100 },
    spreadPct: { type: Number, default: 0.1, min: 0, max: 10 },
    commissionRate: { type: Number, default: 0.001, min: 0, max: 0.1 }
  },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  status: {
    type: String,
    enum: ['running', 'completed', 'failed', 'cancelled'],
    default: 'completed'
  },
  executionTime: { type: Number }, // milliseconds
  positionSide: {
    type: String,
  .enum: ["long", "short", "both"],
    default: "both"
  },
  tradeConfig: { type: Schema.Types.Mixed },
  notes: { type: String, trim: true },
  tags: [{ type: String, trim: true }],
  archived: { type: Boolean, default: false }
}, {
  timestamps: true
});

backtestSchema.index({ userId: 1, createdAt: -1 });
backtestSchema.index({ symbol: 1, timeframe: 1 });
backtestSchema.index({ 'strategy.type': 1 });

backtestSchema.pre('validate', function(next) {
  if (this.startDate && this.endDate && this.startDate >= this.endDate) {
    next(new Error('Start date must be before end date'));
  } else {
    next();
  }
});

backtestSchema.pre("save", function(next) {
  try {
    if (this.isModified('tradeBreakdown') && Array.isArray(this.tradeBreakdown)) {
        const completedTrades = this.tradeBreakdown.filter(trade => trade.result && trade.result !== 'open');
        const winningTrades = completedTrades.filter(trade => trade.profit > 0);
        const losingTrades = completedTrades.filter(trade => trade.profit < 0);
        
        const totalProfit = completedTrades.reduce((sum, trade) => sum + (trade.profit || 0), 0);
        this.totalTrades = completedTrades.length;
        this.profit = totalProfit;
        this.finalBalance = this.initialBalance + this.profit;
        
        if (!this.metrics) this.metrics = {};
        
        this.metrics.totalReturn = this.initialBalance > 0 ? (this.profit / this.initialBalance) * 100 : 0;
        this.metrics.winRate = completedTrades.length > 0 ? (winningTrades.length / completedTrades.length) * 100 : 0;
        this.metrics.totalTrades = completedTrades.length;
        this.metrics.winningTrades = winningTrades.length;
        this.metrics.losingTrades = losingTrades.length;
    }
    next();
  } catch (error) {
    next(error);
  }
});

export default model("Backtest", backtestSchema);
