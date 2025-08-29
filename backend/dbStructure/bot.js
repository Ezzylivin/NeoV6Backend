import mongoose from "mongoose";

const botSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    isRunning: { type: Boolean, default: false },
    symbol: { type: String, required: true },
    amount: { type: Number, required: true },
    timeframes: { type: [String], default: ["5m"] },
    strategy: { type: String, default: "default" }, // ✅ new
    risk: { type: String, default: "medium" },      // ✅ new
    startedAt: { type: Date },
  },
  { timestamps: true }
);

export default mongoose.model("Bot", botSchema);
