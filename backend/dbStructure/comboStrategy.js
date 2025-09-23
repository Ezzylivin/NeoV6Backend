// File: backend/dbStructure/comboStrategy.js
import mongoose from "mongoose";
const { Schema, model } = mongoose;

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
    params: {
      // Store comboConfig details like combinationRule, strategyCodes, etc.
      type: Schema.Types.Mixed,
      default: () => ({}),
    },
  },
  { timestamps: true }
);

// --- Indexes ---
comboStrategySchema.index({ userId: 1, name: 1 }, { unique: true });
comboStrategySchema.index({ userId: 1, createdAt: -1 });

export default model("ComboStrategy", comboStrategySchema);
