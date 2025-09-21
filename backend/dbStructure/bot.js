import mongoose from "mongoose";
const { Schema, model } = mongoose;

// A sub-schema to log the bot's activities
const logEntrySchema = new Schema({
    timestamp: { type: Date, default: Date.now },
    type: { 
        type: String, 
        enum: ['info', 'buy', 'sell', 'error', 'status'], 
        required: true 
    },
    message: { type: String, required: true },
}, { _id: false });

// A sub-schema to track the bot's current open position
const positionSchema = new Schema({
    entryPrice: { type: Number, required: true },
    size: { type: Number, required: true },
    side: { type: String, enum: ['long', 'short'], required: true },
    entryTime: { type: Date, required: true },
}, { _id: false });


const botSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    strategyId: { type: Schema.Types.ObjectId, ref: "Strategy", required: true },
    
    // ✅ UPGRADED: A more descriptive status field
    status: { 
        type: String, 
        default: 'stopped', 
        enum: ['running', 'paused', 'stopped', 'error'] 
    },
    
    symbol: { type: String, required: true, trim: true, uppercase: true },
    timeframe: { type: String, required: true, default: "5m" }, // Changed to a single timeframe for clarity
    
    // ✅ UPGRADED: Clearer capital and trade management
    capitalAllocation: { type: Number, required: true, min: [0, 'Capital cannot be negative'] },
    currentBalance: { type: Number, required: true }, // Tracks the live performance
    
    // ✅ UPGRADED: Live performance tracking
    performanceMetrics: {
        totalProfit: { type: Number, default: 0 },
        totalTrades: { type: Number, default: 0 },
        winRate: { type: Number, default: 0 },
    },

    // ✅ UPGRADED: Live position tracking
    currentPosition: { type: positionSchema, default: null },

    // ✅ UPGRADED: A detailed log of the bot's actions
    logs: [logEntrySchema],

    startedAt: { type: Date },
    stoppedAt: { type: Date },
  },
  { timestamps: true }
);

// Helper method to add a new log entry
botSchema.methods.addLog = function(type, message) {
    this.logs.unshift({ type, message }); // Add new logs to the top
    // Keep the log history to a reasonable size (e.g., 200 entries)
    if (this.logs.length > 200) {
        this.logs.pop();
    }
};

export default model("Bot", botSchema);
