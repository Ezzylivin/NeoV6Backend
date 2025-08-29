// models/Price.js
import mongoose from "mongoose";

const priceSchema = new mongoose.Schema({
  symbol: { type: String, required: true },
  price: { type: Number, required: true },
  timestamp: { type: Date, default: Date.now },
});

export default mongoose.model("Price", priceSchema);
