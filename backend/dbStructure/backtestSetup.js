// File: backend/dbStructure/backtestSetup.js
// NEW: This schema creates a "blueprint" for saving and reusing successful backtest configurations.

import mongoose from "mongoose";
const { Schema, model } = mongoose;

const backtestSetupSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    
    // --- User-defined fields for organization ---
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },

    // --- Core Configuration ---
    symbol: { type: String, required: true, trim: true, uppercase: true },
    timeframe: { type: String, required: true },
    
    // --- Flexible Strategy Configuration ---
    // This boolean will tell the live bot which logic to use.
    isCombo: { type: Boolean, default: false, required: true },
    
    // Used ONLY if isCombo is false.
    strategyId: { type: Schema.Types.ObjectId, ref: "Strategy" }, 
    
    // Used ONLY if isCombo is true.
    comboConfig: { 
        strategyCodes: [String],
        combinationRule: { type: String, enum: ['AND', 'OR'] }
    },
  },
  { timestamps: true }
);

// Ensure that each user has unique names for their setups
backtestSetupSchema.index({ userId: 1, name: 1 }, { unique: true });

export default model("BacktestSetup", backtestSetupSchema);
