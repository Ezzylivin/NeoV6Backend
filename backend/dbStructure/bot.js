// File: backend/dbStructure/bot.js
// 🚀 UPGRADE: v29.2 - Full Data Parity with Python Engine & Frontend

import mongoose from "mongoose";
const { Schema, model } = mongoose;

const logEntrySchema = new Schema({
    timestamp: { type: Date, default: Date.now },
    type: { type: String, enum: ['info', 'buy', 'sell', 'error', 'status', 'system'], required: true },
    message: { type: String, required: true },
}, { _id: false });

const positionSchema = new Schema({
    entryPrice: { type: Number, required: true },
    size: { type: Number, required: true },
    side: { type: String, enum: ['long', 'short'], required: true },
    entryTime: { type: Date, required: true },
    pnl: { type: Number, default: 0 } // Added PnL tracking
}, { _id: false });

const strategyConfigSchema = new Schema({
    code: { type: String, required: true },
    params: { type: Map, of: Number } // Changed to Map for better structure
}, { _id: false });

const botSchema = new Schema(
  {
    // 🆔 Identity
    userId: { type: String, required: true, index: true }, // Wallet Address (0x...)
    botId: { type: String, unique: true, sparse: true },   // Python ID (USER_SYMBOL_TF)
    
    // 📈 Market Config
    symbol: { type: String, required: true, trim: true, uppercase: true },
    timeframe: { type: String, required: true, default: "1h" },
    
    // 💰 Capital & Execution
    capitalAllocation: { type: Number, required: true },
    currentBalance: { type: Number, required: true },
    riskManagementMode: { type: String, enum: ['static', 'dynamic'], default: 'static' },
    riskPercentage: { type: Number, default: 1 },
    maxPyramiding: { type: Number, default: 1 },
    maxDailyLoss: { type: Number, default: 5 },
    maxDrawdown: { type: Number, default: 10 },
    maxTradesPerDay: { type: Number, default: 20 },

    // 🧠 Strategy Logic
    isCombo: { type: Boolean, default: false },
    strategies: [strategyConfigSchema], 
    comboConfig: { 
        combinationRule: { type: String, enum: ['AND', 'OR', 'MAJORITY'], default: 'AND' },
        strategyCodes: [String]
    },
    
    // 🤖 ML Configuration
    mlMode: { type: String, default: 'off' },
    mlModel: { type: String, default: '' },
    mlThreshold: { type: Number, default: 0.5 },

    // ⚙️ Advanced Params (Slippage, etc.)
    params: { type: Schema.Types.Mixed, default: {} }, 

    // 📊 State & Performance
    status: { 
        type: String, 
        default: 'stopped', 
        enum: ['running', 'paused', 'stopped', 'error', 'liquidated'] 
    },
    
    performanceMetrics: {
        totalProfit: { type: Number, default: 0 },
        totalTrades: { type: Number, default: 0 },
        winRate: { type: Number, default: 0 },
        profitFactor: { type: Number, default: 0 },
        maxDrawdown: { type: Number, default: 0 },
        sharpeRatio: { type: Number, default: 0 } // Added Sharpe
    },

    currentPosition: { type: positionSchema, default: null },
    logs: [logEntrySchema],

    startedAt: { type: Date },
    stoppedAt: { type: Date },
  },
  { timestamps: true }
);

// Helper to keep logs clean
botSchema.methods.addLog = function(type, message) {
    this.logs.unshift({ type, message, timestamp: new Date() });
    if (this.logs.length > 200) {
        this.logs.pop();
    }
};

export default model("Bot", botSchema);
