// File: src/backend/dbStructure/tradingBotHistory.js
import mongoose from "mongoose";

const tradingBotHistorySchema = new mongoose.Schema({
  userId: { type: String, required: true },
  symbol: { type: String, required: true },
  balance: { type: Number, default: 1000 },
  profit: { type: Number, default: 0 },
  strategy: { type: String },
  risk: { type: String, default: "Medium" },
  timestamp: { type: Date, default: Date.now },
});

const TradingBotHistory = mongoose.model("TradingBotHistory", tradingBotHistorySchema);

export default TradingBotHistory;
