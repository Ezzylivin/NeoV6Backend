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
      maxlength: 100, // 🔒 prevent abuse
    },
    description: {
      type: String,
      default: "",
      trim: true,
      maxlength: 500, // 🔒 prevent spammy descriptions
    },
    strategies: [
      {
        type: Schema.Types.ObjectId,
        ref: "Strategy",
        required: true,
      },
    ],
    params: {
      type: Schema.Types.Mixed,
      default: () => ({}), // always an object, never null
    },
  },
  { timestamps: true }
);

// --- Indexes ---
// 🔑 Enforce unique combo name per user
comboStrategySchema.index({ userId: 1, name: 1 }, { unique: true });

// ⚡ Optimize frequent queries
comboStrategySchema.index({ userId: 1, createdAt: -1 });

export default model("ComboStrategy", comboStrategySchema);
