import mongoose from "mongoose";
const { Schema, model } = mongoose;

const comboStrategySchema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  name: { type: String, required: true, trim: true },
  description: { type: String, default: "", trim: true },
  strategies: [
    {
      type: Schema.Types.ObjectId,
      ref: "Strategy",
      required: true,
    }
  ],
  params: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
}, { timestamps: true });

// Optional: unique per user
comboStrategySchema.index({ userId: 1, name: 1 }, { unique: true });

export default model("ComboStrategy", comboStrategySchema);
