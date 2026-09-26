import mongoose from "mongoose";
const { Schema, model } = mongoose;

const backtestSetupSchema = new Schema(
  {
    // String (not ObjectId): web3 users are keyed by their lowercased wallet
    // address, which is not a valid ObjectId. Matches strategy/bot/log schemas
    // and what backtestSetupController stores. Storing a wallet address in an
    // ObjectId field caused "Cast to ObjectId failed" for wallet users.
    userId: { type: String, required: true, index: true },
    
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
