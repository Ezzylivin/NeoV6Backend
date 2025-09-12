// File: backend/dbStructure/tradingBotHistory.js
import mongoose from "mongoose";
const { Schema, model } = mongoose;

const tradingBotHistorySchema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  botId: {
    type: Schema.Types.ObjectId,
    ref: 'Bot',
    required: true,
    index: true
  },
  symbol: { type: String, required: true, trim: true, uppercase: true },
  balance: { type: Number, required: true },
  profit: { type: Number, default: 0 },
  strategy: { type: String },
  risk: {
    type: String,
    default: "medium",
    enum: ['low', 'medium', 'high']
  },
}, {
  timestamps: true // Use standard timestamps for createdAt/updatedAt
});

const TradingBotHistory = model("TradingBotHistory", tradingBotHistorySchema);

export default TradingBotHistory;
