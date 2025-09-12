// File: backend/dbStructure/bot.js
import mongoose from "mongoose";
const { Schema, model } = mongoose;

const botSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    strategyId: { type: Schema.Types.ObjectId, ref: "Strategy", required: true },
    isRunning: { type: Boolean, default: false },
    symbol: { type: String, required: true, trim: true, uppercase: true },
    amount: { type: Number, required: true, min: [0, 'Amount cannot be negative'] },
    timeframes: { type: [String], default: ["5m"] },
    risk: {
      type: String,
      default: "medium",
      enum: ['low', 'medium', 'high']
    },
    startedAt: { type: Date },
  },
  { timestamps: true }
);

export default model("Bot", botSchema);
