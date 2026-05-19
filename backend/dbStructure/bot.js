// File: src/backend/dbStructure/bot.js
// 🚀 UPGRADE: v29.9 - Enhanced ML Persistence & Margin Optimization
import mongoose from "mongoose";
import crypto from "crypto"; 

const { Schema, model } = mongoose;

// 1️⃣ LOG ENTRY SCHEMA (Enhanced with color-coding hints)
const logEntrySchema = new Schema({
    timestamp: { type: Date, default: Date.now },
    type: { 
        type: String, 
        enum: ['info', 'buy', 'sell', 'error', 'status', 'system', 'risk', 'warning', 'neural'], 
        required: true,
        set: (v) => v ? v.toLowerCase() : v 
    },
    message: { type: String, required: true },
    data: { type: Schema.Types.Mixed } 
}, { _id: false });

// 2️⃣ POSITION SCHEMA (Added Unrealized Calculation fields)
const positionSchema = new Schema({
    entryPrice: { type: Number, required: true },
    size: { type: Number, required: true },
    side: { type: String, enum: ['long', 'short'], required: true },
    entryTime: { type: Date, default: Date.now },
    stopLoss: { type: Number },
    takeProfit: { type: Number },
    trailingStop: { type: Number }, // Dynamic floor for profits
    currentPrice: { type: Number },
    unrealizedPnL: { type: Number, default: 0 }
}, { _id: false });

// 3️⃣ TRADE HISTORY SCHEMA
const tradeSchema = new Schema({
    symbol: { type: String, required: true },
    side: { type: String, enum: ['long', 'short'], required: true },
    entryPrice: { type: Number, required: true },
    exitPrice: { type: Number, required: true },
    size: { type: Number, required: true },
    entryTime: { type: Date, required: true },
    exitTime: { type: Date, default: Date.now },
    pnl: { type: Number, required: true },
    pnlPct: { type: Number, default: 0 },
    fee: { type: Number, default: 0 },
    exitReason: { type: String, enum: ['strategy', 'sl', 'tp', 'trailing', 'manual', 'halt'], default: 'strategy' }
}, { _id: false });

// 4️⃣ STRATEGY CONFIG SCHEMA
const strategyConfigSchema = new Schema({
    code: { type: String, required: true },
    active: { type: Boolean, default: true },
    params: { type: Map, of: Schema.Types.Mixed } 
}, { _id: false });

// 5️⃣ EQUITY CURVE (For Frontend Visualization)
const equityPointSchema = new Schema({
    timestamp: { type: Date, default: Date.now },
    balance: { type: Number, required: true },
    pnlPct: { type: Number, default: 0 }
}, { _id: false });

// ======================================================
// 🤖 MAIN BOT SCHEMA
// ======================================================
const botSchema = new Schema(
  {
    // 🆔 IDENTITY
    userId: { type: String, required: true, index: true }, 
    botId: { type: String, unique: true, sparse: true },    
    
    // 📈 MARKET CONFIG
    symbol: { type: String, required: true, trim: true, uppercase: true },
    timeframe: { type: String, required: true, default: "1h" },
    enable_shorting: { type: Boolean, default: false }, 
    
    // 💰 CAPITAL & RISK
    capitalAllocation: { type: Number, required: true }, 
    currentBalance: { type: Number, required: true },       
    
    riskManagementMode: { type: String, enum: ['static', 'dynamic'], default: 'static' },
    riskPercentage: { type: Number, default: 1 }, 
    maxPyramiding: { type: Number, default: 1 },
    maxTradesPerDay: { type: Number, default: 20 },
    
    // 🛑 SAFETY LIMITS
    maxDailyLoss: { type: Number, default: 5 },  
    maxDrawdown: { type: Number, default: 10 },  

    // 🧠 STRATEGY LOGIC
    isCombo: { type: Boolean, default: false },
    strategies: [strategyConfigSchema], 
    comboConfig: { 
        combinationRule: { type: String, enum: ['AND', 'OR', 'MAJORITY'], default: 'OR' },
        strategyCodes: [String],
        minVotesRequired: { type: Number, default: 1 } 
    },
    
    // 🤖 ML CONFIGURATION (Optimized for Ensemble/Stacking)
    mlMode: { type: String, enum: ['off', 'predictions', 'on'], default: 'off' },
    mlModel: { type: String, default: '' },
    mlThresholdLong: { type: Number, default: 0.55 },
    mlThresholdShort: { type: Number, default: 0.55 },
      
    mlConfig: {
        featureScaling: { type: Boolean, default: true },
        ensembleWeights: { type: Map, of: Number }, // For Stacking Hybrid
        lookbackWindows: [Number]
    },

    // ⚙️ EXECUTION PARAMS
    params: { type: Schema.Types.Mixed, default: {} },
    // 🚀 UPGRADE: Explicitly track paper vs live routing
    mode: { type: String, enum: ['paper', 'live'], default: 'paper' },
    slippageTolerance: { type: Number, default: 0.5 }, 
    leverage: { type: Number, default: 1 },

    // 📊 STATE & PERFORMANCE
    status: { 
        type: String, 
        default: 'stopped', 
        enum: ['running', 'paused', 'stopped', 'error', 'liquidated', 'stopping'] 
    },
    
    performanceMetrics: {
        totalProfit: { type: Number, default: 0 },
        totalTrades: { type: Number, default: 0 },
        winRate: { type: Number, default: 0 },        
        profitFactor: { type: Number, default: 0 },
        sharpeRatio: { type: Number, default: 0 },
        maxDrawdown: { type: Number, default: 0 },  
        avgWin: { type: Number, default: 0 },
        avgLoss: { type: Number, default: 0 },
        largestWin: { type: Number, default: 0 },
        largestLoss: { type: Number, default: 0 }
    },

    tradeHistory: [tradeSchema],
    activePositions: [positionSchema],
    
    // 🕯️ MARKET DATA
    candles: [{ type: Schema.Types.Mixed }],
    
    equityCurve: [equityPointSchema], 
    currentPosition: { type: positionSchema, default: null },
    logs: [logEntrySchema],

    startedAt: { type: Date },
    stoppedAt: { type: Date },
    lastActive: { type: Date, default: Date.now } 
  },
  { 
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
    strict: false 
  }
);

// ======================================================
// 🧮 VIRTUALS (Computed Dashboard Data)
// ======================================================

botSchema.virtual('roi').get(function() {
    if (!this.capitalAllocation || this.capitalAllocation === 0) return 0;
    return (this.currentBalance - this.capitalAllocation) / this.capitalAllocation;
});

botSchema.virtual('isMarginEnabled').get(function() {
    return this.enable_shorting || this.leverage > 1;
});

botSchema.virtual('dailyPnL').get(function() {
    if (this.equityCurve.length < 2) return 0;
    const last = this.equityCurve[this.equityCurve.length - 1].balance;
    const startOfDay = this.equityCurve[0].balance;
    return last - startOfDay;
});

// ======================================================
// 🛡️ HOOKS (System Integrity)
// ======================================================

botSchema.pre('save', function(next) {
    // Generate unique ID if missing
    if (!this.botId) {
        const suffix = crypto.randomBytes(4).toString('hex');
        this.botId = `BOT_${this.symbol}_${this.timeframe}_${suffix}`;
    }

    // Safety: If shorting is disabled, leverage must be 1 (Spot only)
    if (!this.enable_shorting && this.leverage > 1) {
        this.leverage = 1;
        this.addLog('warning', 'Leverage reset to 1x as Shorting is disabled.');
    }
    next();
});

// ======================================================
// 🛠️ METHODS (Bot Lifecycle Operations)
// ======================================================

botSchema.methods.startSession = async function(liveBalance) {
    this.status = 'running';
    this.startedAt = new Date();
    this.stoppedAt = null; 
    
    this.currentBalance = liveBalance;
    this.capitalAllocation = liveBalance; 
    
    this.addLog('status', `🚀 Protocol Ignited. Capital: $${liveBalance.toFixed(2)}`);
    return this.save();
};

botSchema.methods.addLog = function(type, message, data = null) {
    const entry = { type: type || 'info', message, timestamp: new Date(), data };
    this.logs.unshift(entry);
    if (this.logs.length > 200) this.logs.pop();
};

botSchema.methods.recordTrade = function(tradeData) {
    this.tradeHistory.push(tradeData);
    this.updateMetrics(tradeData.pnl);
};

botSchema.methods.updateMetrics = function(pnl) {
    const pm = this.performanceMetrics;
    pm.totalTrades++;
    pm.totalProfit += pnl;
    
    // Update Equity Curve
    this.equityCurve.push({
        timestamp: new Date(),
        balance: this.currentBalance + pnl,
        pnlPct: (pnl / this.capitalAllocation) * 100
    });

    // Simple Win Rate calculation
    const wins = this.tradeHistory.filter(t => t.pnl > 0).length;
    pm.winRate = (wins / pm.totalTrades) * 100;
};

export default mongoose.models.Bot || model("Bot", botSchema);
