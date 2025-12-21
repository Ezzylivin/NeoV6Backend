// File: backend/dbStructure/bot.js
// 🚀 UPGRADE: v29.3 - Hybrid Params Support (Strings & Numbers)

import mongoose from "mongoose";
const { Schema, model } = mongoose;

// 1️⃣ LOG ENTRY SCHEMA
const logEntrySchema = new Schema({
    timestamp: { type: Date, default: Date.now },
    type: { 
        type: String, 
        enum: ['info', 'buy', 'sell', 'error', 'status', 'system', 'risk'], 
        required: true 
    },
    message: { type: String, required: true },
    data: { type: Schema.Types.Mixed } // Optional payload for debugging
}, { _id: false });

// 2️⃣ POSITION SCHEMA (Live Trades)
const positionSchema = new Schema({
    entryPrice: { type: Number, required: true },
    size: { type: Number, required: true },
    side: { type: String, enum: ['long', 'short'], required: true },
    entryTime: { type: Date, default: Date.now },
    stopLoss: { type: Number },
    takeProfit: { type: Number },
    currentPrice: { type: Number }, // For real-time updates
    unrealizedPnL: { type: Number, default: 0 }
}, { _id: false });

// 3️⃣ STRATEGY CONFIG SCHEMA
const strategyConfigSchema = new Schema({
    code: { type: String, required: true }, // e.g., "sma_crossover"
    active: { type: Boolean, default: true },
    // 🛠️ UPGRADE: Changed 'of: Number' to 'of: Schema.Types.Mixed'
    // This allows params to hold Numbers (14, 0.5) AND Strings ("btc_xgboost")
    params: { type: Map, of: Schema.Types.Mixed } 
}, { _id: false });

// 4️⃣ EQUITY CURVE (For Frontend Charts)
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
    
    // 💰 CAPITAL & RISK (The Engine Room)
    capitalAllocation: { type: Number, required: true }, // The "Baseline"
    currentBalance: { type: Number, required: true },    // The "Live" Value
    
    riskManagementMode: { type: String, enum: ['static', 'dynamic'], default: 'static' },
    riskPercentage: { type: Number, default: 1 }, // Risk per trade
    maxPyramiding: { type: Number, default: 1 },
    maxTradesPerDay: { type: Number, default: 20 },
    
    // 🛑 SAFETY LIMITS
    maxDailyLoss: { type: Number, default: 5 },  // Stop if daily PnL < -5%
    maxDrawdown: { type: Number, default: 10 },  // Stop if total PnL < -10%

    // 🧠 STRATEGY LOGIC
    isCombo: { type: Boolean, default: false },
    strategies: [strategyConfigSchema], 
    comboConfig: { 
        combinationRule: { type: String, enum: ['AND', 'OR', 'MAJORITY'], default: 'OR' },
        strategyCodes: [String],
        minVotesRequired: { type: Number, default: 1 } // For MAJORITY rules
    },
    
    // 🤖 ML CONFIGURATION
    mlMode: { type: String, enum: ['off', 'predictions', 'on'], default: 'off' },
    mlModel: { type: String, default: '' },
    mlThreshold: { type: Number, default: 0.5 },

    // ⚙️ EXECUTION PARAMS
    slippageTolerance: { type: Number, default: 0.5 }, // %
    leverage: { type: Number, default: 1 },

    // 📊 STATE & PERFORMANCE
    status: { 
        type: String, 
        default: 'stopped', 
        enum: ['running', 'paused', 'stopped', 'error', 'liquidated', 'stopping'] 
    },
    
    // Comprehensive Metrics for Frontend
    performanceMetrics: {
        totalProfit: { type: Number, default: 0 },
        totalTrades: { type: Number, default: 0 },
        winRate: { type: Number, default: 0 },       // %
        profitFactor: { type: Number, default: 0 },
        sharpeRatio: { type: Number, default: 0 },
        maxDrawdown: { type: Number, default: 0 },  // Actual historical max DD
        avgWin: { type: Number, default: 0 },
        avgLoss: { type: Number, default: 0 },
        largestWin: { type: Number, default: 0 },
        largestLoss: { type: Number, default: 0 }
    },

    equityCurve: [equityPointSchema], // History for graphing
    currentPosition: { type: positionSchema, default: null },
    logs: [logEntrySchema],

    startedAt: { type: Date },
    stoppedAt: { type: Date },
    lastActive: { type: Date, default: Date.now } // For heartbeat monitoring
  },
  { timestamps: true }
);

// ======================================================
// 🛠️ METHODS
// ======================================================

/**
 * ⚡ SYNC START
 * Call this when the bot starts to enforce the "Capital = Balance" rule.
 * This fixes the "99% Loss" bug by resetting the baseline.
 */
botSchema.methods.startSession = async function(liveBalance) {
    this.status = 'running';
    this.startedAt = new Date();
    this.stoppedAt = null;
    
    // 🔑 The Magic Fix:
    this.currentBalance = liveBalance;
    this.capitalAllocation = liveBalance; 
    
    // Add initial log
    this.addLog('status', `🚀 Bot Started. Capital aligned to Balance: $${liveBalance.toFixed(2)}`);
    
    // Optional: Reset daily metrics here if needed
    return this.save();
};

// Helper: Keep logs clean (Max 200 entries)
botSchema.methods.addLog = function(type, message, data = null) {
    const entry = { type, message, timestamp: new Date(), data };
    this.logs.unshift(entry);
    if (this.logs.length > 200) {
        this.logs.pop();
    }
};

// Helper: Update Performance Metrics
botSchema.methods.updateMetrics = function(pnl) {
    const pm = this.performanceMetrics;
    pm.totalTrades++;
    pm.totalProfit += pnl;
    
    // Basic stats logic would go here or be calculated by the engine
    // This is just a placeholder to show where the logic sits
    this.equityCurve.push({
        timestamp: new Date(),
        balance: this.currentBalance + pnl,
        pnlPct: (pnl / this.capitalAllocation) * 100
    });
};

export default model("Bot", botSchema);
