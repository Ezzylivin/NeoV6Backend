// File: backend/dbStructure/bot.js
// 🚀 UPGRADE: v29.0 - "Full State Persistence" (Matches Python Bot Payload)

import mongoose from "mongoose";
const { Schema, model } = mongoose;

const logEntrySchema = new Schema({
    timestamp: { type: Date, default: Date.now },
    type: { type: String, enum: ['info', 'buy', 'sell', 'error', 'status'], required: true },
    message: { type: String, required: true },
}, { _id: false });

const positionSchema = new Schema({
    entryPrice: { type: Number, required: true },
    size: { type: Number, required: true },
    side: { type: String, enum: ['long', 'short'], required: true },
    entryTime: { type: Date, required: true },
}, { _id: false });

// Sub-schema for individual strategy config
const strategyConfigSchema = new Schema({
    code: { type: String, required: true },
    params: { type: Schema.Types.Mixed, default: {} } // Stores { period: 14, etc }
}, { _id: false });

const botSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    
    // --- 1. Core Identity ---
    symbol: { type: String, required: true, trim: true, uppercase: true },
    timeframe: { type: String, required: true, default: "1h" },
    capitalAllocation: { type: Number, required: true, min: [0, 'Capital cannot be negative'] },
    
    // --- 2. Strategy Configuration (The "Brain") ---
    isCombo: { type: Boolean, default: false },
    
    // Stores the FULL strategy list (Code + Params)
    // Matches Python: strategies=[{"code": "sma", "params": {...}}]
    strategies: [strategyConfigSchema], 

    // Global Params (Risk, Pyramiding, TSL)
    params: { type: Schema.Types.Mixed, default: {} }, 

    // --- 3. Combo Logic (Only if isCombo=true) ---
    comboConfig: { 
        combinationRule: { 
            type: String, 
            enum: ['AND', 'OR', 'REGIME'],
            default: 'AND'
        }
    },
    
    // --- 4. ML Configuration ---
    mlMode: { type: String, default: 'off' },
    mlModel: { type: String, default: '' },
    mlThreshold: { type: Number, default: 0.5 },

    // --- 5. State & Performance ---
    status: { 
        type: String, 
        default: 'stopped', 
        enum: ['running', 'paused', 'stopped', 'error'] 
    },
    currentBalance: { type: Number, required: true },
    
    performanceMetrics: {
        totalProfit: { type: Number, default: 0 },
        totalTrades: { type: Number, default: 0 },
        winRate: { type: Number, default: 0 },
        profitFactor: { type: Number, default: 0 },
        maxDrawdown: { type: Number, default: 0 }
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
    this.logs.unshift({ type, message });
    if (this.logs.length > 200) {
        this.logs.pop();
    }
};

export default model("Bot", botSchema);
