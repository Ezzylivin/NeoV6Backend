// File: backend/dbStructure/bot.js
// FINAL VERSION: This schema supports both single and combined strategy configurations for the live trading bot.

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

const botSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    
    isCombo: { type: Boolean, default: false, required: true },
    
    // ✅ FIX: This field is now ONLY required if isCombo is FALSE.
    strategyId: { 
        type: Schema.Types.ObjectId, 
        ref: "Strategy",
        required: function() { return this.isCombo === false; }
    }, 
    
    // ✅ FIX: This entire object and its fields are now ONLY required if isCombo is TRUE.
    comboConfig: { 
        strategyCodes: {
            type: [String],
            required: function() { return this.isCombo === true; }
        },
        combinationRule: { 
            type: String, 
            enum: ['AND', 'OR'],
            required: function() { return this.isCombo === true; }
        }
    },
    
    status: { 
        type: String, 
        default: 'stopped', 
        enum: ['running', 'paused', 'stopped', 'error'] 
    },
    symbol: { type: String, required: true, trim: true, uppercase: true },
    timeframe: { type: String, required: true, default: "5m" },
    
    capitalAllocation: { type: Number, required: true, min: [0, 'Capital cannot be negative'] },
    currentBalance: { type: Number, required: true },
    
    performanceMetrics: {
        totalProfit: { type: Number, default: 0 },
        totalTrades: { type: Number, default: 0 },
        winRate: { type: Number, default: 0 },
    },

    currentPosition: { type: positionSchema, default: null },
    logs: [logEntrySchema],

    startedAt: { type: Date },
    stoppedAt: { type: Date },
  },
  { timestamps: true }
);

botSchema.methods.addLog = function(type, message) {
    this.logs.unshift({ type, message });
    if (this.logs.length > 200) {
        this.logs.pop();
    }
};

export default model("Bot", botSchema);
