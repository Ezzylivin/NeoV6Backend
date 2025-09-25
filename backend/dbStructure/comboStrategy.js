// File: backend/dbStructure/comboStrategy.js
import mongoose from "mongoose";
const { Schema, model } = mongoose;

// Define per-strategy parameter schema
const StrategyParamSchema = new Schema(
  {
    strategyId: {
      type: Schema.Types.ObjectId,
      ref: "Strategy",
      required: true,
    },
    params: {
      type: Object, // JSON object with stopLoss, takeProfit, etc.
      required: true,
    },
  },
  { _id: false }
);

const comboStrategySchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    description: {
      type: String,
      default: "",
      trim: true,
      maxlength: 500,
    },
    strategies: [
      {
        type: Schema.Types.ObjectId,
        ref: "Strategy",
        required: true,
      },
    ],

    // More explicit params schema
    params: {
      combinationRule: {
        type: String,
        enum: ["AND", "OR"],
        required: true,
      },
      symbol: { type: String, required: true },
      timeframe: { type: String, required: true },
      startDate: { type: Date, required: true },
      endDate: { type: Date, required: true },

      // Per-strategy configs
      strategyParams: [StrategyParamSchema],
    },
  },
  { timestamps: true }
);

// --- Indexes ---
comboStrategySchema.index({ userId: 1, name: 1 }, { unique: true });
comboStrategySchema.index({ userId: 1, createdAt: -1 });

export default model("ComboStrategy", comboStrategySchema);
