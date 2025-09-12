// File: backend/dbStructure/backtest.js
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
  
  // Market data info
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
    uppercase: true,
    enum: ['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w'],
    default: '1h'
  },
  
  // Balance info
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
  
  // Trade summary
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
  
  // Strategy info
  strategy: {
    type: strategyConfigSchema,
    required: true
  },
  
  // Detailed results
  tradeBreakdown: [tradeResultSchema],
  equityCurve: [equityPointSchema],
  metrics: metricsSchema,
  
  // Risk management settings used
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
  
  // Realism settings
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
  
  // Test period
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  
  // Status and metadata
  status: {
    type: String,
    enum: ['running', 'completed', 'failed', 'cancelled'],
    default: 'completed'
  },
  executionTime: { type: Number }, // milliseconds
  
  // Position tracking
  positionSide: { 
    type: String, 
    enum: ["long", "short", "both"], 
    default: "both" 
  },
  
  // Extra configuration for reproducibility
  tradeConfig: { type: Schema.Types.Mixed },
  
  // Notes and tags
  notes: { type: String, trim: true },
  tags: [{ type: String, trim: true }],
  
  // Archive flag
  archived: { type: Boolean, default: false }
}, { 
  timestamps: true,
  // Add indexes for better query performance
  indexes: [
    { userId: 1, createdAt: -1 },
    { symbol: 1, timeframe: 1 },
    { 'strategy.type': 1 },
    { status: 1 },
    { archived: 1 }
  ]
});

// Validate date range
backtestSchema.pre('validate', function(next) {
  if (this.startDate && this.endDate && this.startDate >= this.endDate) {
    next(new Error('Start date must be before end date'));
  } else {
    next();
  }
});

// Compute metrics and derived values
backtestSchema.pre("save", function(next) {
  try {
    // Calculate basic metrics from trade breakdown
    if (Array.isArray(this.tradeBreakdown) && this.tradeBreakdown.length > 0) {
      const completedTrades = this.tradeBreakdown.filter(trade => 
        trade.result && trade.result !== 'open'
      );
      
      const winningTrades = completedTrades.filter(trade => trade.profit > 0);
      const losingTrades = completedTrades.filter(trade => trade.profit < 0);
      
      // Basic calculations
      const totalProfit = completedTrades.reduce((sum, trade) => sum + (trade.profit || 0), 0);
      const totalCommissions = completedTrades.reduce((sum, trade) => 
        sum + (trade.commission || 0) + (trade.exitCommission || 0), 0);
      
      // Update basic fields
      this.totalTrades = completedTrades.length;
      this.profit = totalProfit - totalCommissions;
      this.finalBalance = this.initialBalance + this.profit;
      
      // Calculate enhanced metrics
      if (!this.metrics) this.metrics = {};
      
      this.metrics.totalReturn = this.initialBalance > 0 
        ? (this.profit / this.initialBalance) * 100 
        : 0;
      
      this.metrics.winRate = completedTrades.length > 0 
        ? (winningTrades.length / completedTrades.length) * 100 
        : 0;
      
      this.metrics.totalTrades = completedTrades.length;
      this.metrics.winningTrades = winningTrades.length;
      this.metrics.losingTrades = losingTrades.length;
      
      // Win/Loss analysis
      if (winningTrades.length > 0) {
        this.metrics.averageWin = winningTrades.reduce((sum, t) => sum + t.profit, 0) / winningTrades.length;
        this.metrics.largestWin = Math.max(...winningTrades.map(t => t.profit));
      }
      
      if (losingTrades.length > 0) {
        this.metrics.averageLoss = Math.abs(losingTrades.reduce((sum, t) => sum + t.profit, 0) / losingTrades.length);
        this.metrics.largestLoss = Math.abs(Math.min(...losingTrades.map(t => t.profit)));
      }
      
      // Profit factor
      const totalWins = winningTrades.reduce((sum, t) => sum + t.profit, 0);
      const totalLosses = Math.abs(losingTrades.reduce((sum, t) => sum + t.profit, 0));
      
      this.metrics.profitFactor = totalLosses > 0 ? totalWins / totalLosses : (totalWins > 0 ? 999 : 1);
    }
    
    // Ensure no negative balances
    if (isNaN(this.profit)) this.profit = 0;
    if (isNaN(this.finalBalance) || this.finalBalance < 0) {
      this.finalBalance = Math.max(0, this.initialBalance + this.profit);
    }
    
    next();
  } catch (error) {
    next(error);
  }
});

// Instance methods
backtestSchema.methods.getReturnPercentage = function() {
  return this.initialBalance > 0 ? ((this.finalBalance - this.initialBalance) / this.initialBalance) * 100 : 0;
};

backtestSchema.methods.isProfit = function() {
  return this.finalBalance > this.initialBalance;
};

backtestSchema.methods.getDurationDays = function() {
  if (!this.startDate || !this.endDate) return 0;
  return Math.ceil((this.endDate - this.startDate) / (1000 * 60 * 60 * 24));
};

// Static methods
backtestSchema.statics.findByUserId = function(userId, limit = 50) {
  return this.find({ userId, archived: false })
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate('userId', 'username email');
};

backtestSchema.statics.findBestPerforming = function(userId, limit = 10) {
  return this.find({ userId, status: 'completed', archived: false })
    .sort({ 'metrics.totalReturn': -1 })
    .limit(limit);
};

export default model("Backtest", backtestSchema);

// ---

// File: backend/dbStructure/price.js
import mongoose from 'mongoose';
const { Schema, model } = mongoose;

const priceSchema = new Schema({
  symbol: {
    type: String,
    required: true,
    uppercase: true,
    trim: true,
    index: true,
    validate: {
      validator: function(v) {
        return /^[A-Z]{2,10}$/.test(v); // Basic symbol validation
      },
      message: 'Symbol must be 2-10 uppercase letters'
    }
  },
  timestamp: {
    type: Date,
    required: true,
    index: true,
  },
  open: {
    type: Number,
    required: true,
    min: [0, 'Open price must be positive']
  },
  high: {
    type: Number,
    required: true,
    min: [0, 'High price must be positive']
  },
  low: {
    type: Number,
    required: true,
    min: [0, 'Low price must be positive']
  },
  close: {
    type: Number,
    required: true,
    min: [0, 'Close price must be positive']
  },
  volume: {
    type: Number,
    default: 0,
    min: [0, 'Volume cannot be negative']
  },
  // Additional fields for technical analysis
  vwap: Number, // Volume Weighted Average Price
  trades: Number, // Number of trades in this period
  
  // Data source tracking
  source: {
    type: String,
    enum: ['binance', 'coinbase', 'kraken', 'manual', 'test'],
    default: 'binance'
  },
  
  // Quality flags
  verified: { type: Boolean, default: false },
  anomaly: { type: Boolean, default: false }
}, {
  timestamps: true,
  // Compound indexes for better query performance
  indexes: [
    { symbol: 1, timestamp: 1 }, // Most common query pattern
    { symbol: 1, timestamp: -1 }, // Reverse chronological
    { timestamp: -1 }, // Recent data across all symbols
    { symbol: 1, source: 1, timestamp: 1 } // Source-specific queries
  ]
});

// Validate OHLC relationships
priceSchema.pre('validate', function(next) {
  if (this.high < this.low) {
    next(new Error('High price cannot be less than low price'));
  } else if (this.high < this.open || this.high < this.close) {
    next(new Error('High price must be >= open and close prices'));
  } else if (this.low > this.open || this.low > this.close) {
    next(new Error('Low price must be <= open and close prices'));
  } else {
    next();
  }
});

// Calculate typical price and VWAP if not provided
priceSchema.pre('save', function(next) {
  // Calculate VWAP if not provided
  if (!this.vwap && this.volume > 0) {
    this.vwap = ((this.high + this.low + this.close) / 3);
  }
  
  next();
});

// Instance methods
priceSchema.methods.getTypicalPrice = function() {
  return (this.high + this.low + this.close) / 3;
};

priceSchema.methods.getTrueRange = function(prevClose) {
  const tr1 = this.high - this.low;
  const tr2 = prevClose ? Math.abs(this.high - prevClose) : 0;
  const tr3 = prevClose ? Math.abs(this.low - prevClose) : 0;
  return Math.max(tr1, tr2, tr3);
};

priceSchema.methods.isGreenCandle = function() {
  return this.close > this.open;
};

// Static methods
priceSchema.statics.getSymbolData = function(symbol, startDate, endDate, limit = 1000) {
  const query = { symbol: symbol.toUpperCase() };
  
  if (startDate || endDate) {
    query.timestamp = {};
    if (startDate) query.timestamp.$gte = new Date(startDate);
    if (endDate) query.timestamp.$lte = new Date(endDate);
  }
  
  return this.find(query)
    .sort({ timestamp: 1 })
    .limit(limit)
    .lean();
};

priceSchema.statics.getLatestPrice = function(symbol) {
  return this.findOne({ symbol: symbol.toUpperCase() })
    .sort({ timestamp: -1 })
    .lean();
};

priceSchema.statics.getAvailableSymbols = function() {
  return this.distinct('symbol');
};

// Create unique compound index to prevent duplicate entries
priceSchema.index({ symbol: 1, timestamp: 1 }, { unique: true });

const Price = model('Price', priceSchema);
export default Price;

// ---

// File: backend/dbStructure/strategy.js
import mongoose from "mongoose";
const { Schema, model } = mongoose;

// Parameter schema for strategy configuration
const parameterSchema = new Schema({
  // Moving Average parameters
  fast: { type: Number, min: 1, max: 100 },
  slow: { type: Number, min: 5, max: 200 },
  
  // RSI parameters
  period: { type: Number, min: 2, max: 100 },
  oversold: { type: Number, min: 0, max: 50 },
  overbought: { type: Number, min: 50, max: 100 },
  
  // MACD parameters
  signal: { type: Number, min: 1, max: 50 },
  
  // Bollinger Bands
  multiplier: { type: Number, min: 0.5, max: 5 },
  
  // Stochastic
  kPeriod: { type: Number, min: 1, max: 50 },
  dPeriod: { type: Number, min: 1, max: 20 },
  
  // Custom parameters (flexible)
  custom: { type: Schema.Types.Mixed }
}, { _id: false, strict: false });

// Statistics tracking schema
const statisticsSchema = new Schema({
  // Performance metrics
  totalTrades: { type: Number, default: 0, min: 0 },
  winningTrades: { type: Number, default: 0, min: 0 },
  losingTrades: { type: Number, default: 0, min: 0 },
  winRate: { type: Number, default: 0, min: 0, max: 100 },
  
  // Financial metrics
  totalProfit: { type: Number, default: 0 },
  totalLoss: { type: Number, default: 0 },
  netProfit: { type: Number, default: 0 },
  profitFactor: { type: Number, default: 0, min: 0 },
  
  // Risk metrics
  maxDrawdown: { type: Number, default: 0, min: 0, max: 100 },
  sharpeRatio: { type: Number, default: 0 },
  cagr: { type: Number, default: 0 }, // Compound Annual Growth Rate
  volatility: { type: Number, default: 0, min: 0 },
  
  // Trade metrics
  averageWin: { type: Number, default: 0 },
  averageLoss: { type: Number, default: 0 },
  largestWin: { type: Number, default: 0 },
  largestLoss: { type: Number, default: 0 },
  
  // Consistency metrics
  consecutiveWins: { type: Number, default: 0, min: 0 },
  consecutiveLosses: { type: Number, default: 0, min: 0 },
  
  // Last update
  lastUpdated: { type: Date, default: Date.now }
}, { _id: false });

const strategySchema = new Schema({
  // User association
  userId: { 
    type: Schema.Types.ObjectId, 
    ref: "User", 
    required: true,
    index: true
  },
  
  // Basic strategy info
  name: { 
    type: String, 
    required: true,
    trim: true,
    maxlength: [100, 'Strategy name cannot exceed 100 characters']
  },
  description: { 
    type: String, 
    trim: true,
    maxlength: [1000, 'Description cannot exceed 1000 characters']
  },
  
  // Strategy classification
  strategyType: { 
    type: String, 
    required: true,
    enum: ['SMA', 'EMA', 'RSI', 'MACD', 'BOLLINGERBANDS', 'STOCHASTIC', 'VWAP', 'ATR', 'CUSTOM'],
    uppercase: true
  },
  category: {
    type: String,
    enum: ['trend_following', 'mean_reversion', 'momentum', 'volatility', 'arbitrage', 'custom'],
    default: 'trend_following'
  },
  
  // Status and lifecycle
  isActive: { type: Boolean, default: false },
  isTemplate: { type: Boolean, default: false }, // Can be used as template by others
  version: { type: String, default: '1.0.0' },
  
  // Trading parameters
  params: {
    // Market settings
    symbol: { 
      type: String, 
      default: "BTCUSDT",
      uppercase: true,
      trim: true
    },
    timeframe: { 
      type: String, 
      default: "1h",
      enum: ['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w']
    },
    
    // Capital management
    initialBalance: { 
      type: Number, 
      default: 10000,
      min: [1, 'Initial balance must be positive']
    },
    maxPositionSize: {
      type: Number,
      default: 1.0, // 100% of balance
      min: 0.01,
      max: 1.0
    },
    
    // Strategy-specific parameters
    indicators: parameterSchema,
    
    // Risk management
    risk: { 
      type: String, 
      enum: ["Low", "Medium", "High"], 
      default: "Medium" 
    },
    stopLoss: { 
      type: Number, 
      min: 0, 
      max: 1,
      default: 0.02 // 2%
    },
    takeProfit: { 
      type: Number, 
      min: 0, 
      max: 5,
      default: 0.06 // 6%
    },
    
    // Advanced settings
    trailing: {
      enabled: { type: Boolean, default: false },
      distance: { type: Number, default: 0.02 } // 2%
    },
    
    // Backtesting options
    backtestOptions: {
      lookbackPeriod: { type: Number, default: 30 }, // days
      commissionRate: { type: Number, default: 0.001, min: 0, max: 0.1 }, // 0.1%
      slippageRate: { type: Number, default: 0.001, min: 0, max: 0.1 }, // 0.1%
      useRealisticFees: { type:
