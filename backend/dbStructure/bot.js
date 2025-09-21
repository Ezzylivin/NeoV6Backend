// File: backend/dbStructure/bot.js
// FINAL VERSION: This schema supports both single and combined strategy configurations for the live trading bot.

import mongoose from "mongoose";
const { Schema, model } = mongoose;

// A sub-schema to log the bot's activities (e.g., "Checked for signals," "Entered long position").
const logEntrySchema = new Schema({
    timestamp: { type: Date, default: Date.now },
    type: { 
        type: String, 
        enum: ['info', 'buy', 'sell', 'error', 'status'], 
        required: true 
    },
    message: { type: String, required: true },
}, { _id: false });

// A sub-schema to track the bot's current open position in the market.
const positionSchema = new Schema({
    entryPrice: { type: Number, required: true },
    size: { type: Number, required: true },
    side: { type: String, enum: ['long', 'short'], required: true },
    entryTime: { type: Date, required: true },
}, { _id: false });


const botSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    
    // --- Flexible Strategy Configuration ---
    // This boolean tells the bot's "brain" (the botService) which logic to run.
    isCombo: { type: Boolean, default: false, required: true },
    
    // Used ONLY if isCombo is false.
    strategyId: { type: Schema.Types.ObjectId, ref: "Strategy" }, 
    
    // Used ONLY if isCombo is true.
    comboConfig: { 
        strategyCodes: [String],
        combinationRule: { type: String, enum: ['AND', 'OR'] }
    },
    
    status: { 
        type: String, 
        default: 'stopped', 
        enum: ['running', 'paused', 'stopped', 'error'] 
    },
    symbol: { type: String, required: true, trim: true, uppercase: true },
    timeframe: { type: String, required: true, default: "5m" },
    
    // --- Capital and Performance Tracking ---
    capitalAllocation: { type: Number, required: true, min: [0, 'Capital cannot be negative'] },
    currentBalance: { type: Number, required: true },
    
    performanceMetrics: {
        totalProfit: { type: Number, default: 0 },
        totalTrades: { type: Number, default: 0 },
        winRate: { type: Number, default: 0 },
    },

    // --- Live State ---
    currentPosition: { type: positionSchema, default: null },
    logs: [logEntrySchema],

    // --- Timestamps ---
    startedAt: { type: Date },
    stoppedAt: { type: Date },
  },
  { timestamps: true }
);

// --- Helper Methods ---
// This method provides a clean way for the botService to add new log entries.
botSchema.methods.addLog = function(type, message) {
    this.logs.unshift({ type, message }); // Adds new logs to the top of the list
    // To prevent the log array from growing infinitely, we cap it at 200 entries.
    if (this.logs.length > 200) {
        this.logs.pop();
    }
};

export default model("Bot", botSchema);

