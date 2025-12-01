import mongoose from "mongoose";
const { Schema, model } = mongoose;

const backtestSetupSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    
    // --- Organization ---
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },

    // --- Core Config ---
    symbol: { type: String, required: true, trim: true, uppercase: true },
    timeframe: { type: String, required: true },
    initialBalance: { type: Number, default: 1000 },

    // --- Strategy Logic ---
    isCombo: { type: Boolean, default: false, required: true },
    
    // 🚀 KEY FIX: Store full strategy list + specific params (not just ID)
    strategies: [
      {
        code: String, // e.g. "rsi_divergence"
        params: Schema.Types.Mixed // e.g. { length: 14 }
      }
    ],

    // For Combo Logic
    comboConfig: { 
        strategyCodes: [String],
        combinationRule: { type: String, default: 'AND' }
    },

    // 🚀 KEY FIX: Store Global Params (Risk, Fees, ML)
    params: { type: Schema.Types.Mixed, default: {} }, // Stores tslAtrMult, riskPercentage
    
    // --- Machine Learning ---
    mlMode: { type: String, default: 'off' },
    mlModel: { type: String, default: '' },
    mlThreshold: { type: Number, default: 0.5 },
  },
  { timestamps: true }
);

// Unique name per user
backtestSetupSchema.index({ userId: 1, name: 1 }, { unique: true });

export default model("BacktestSetup", backtestSetupSchema);
