// File: backend/dbStructure/order.js
import mongoose from 'mongoose';
const { Schema, model } = mongoose;

const orderSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  botId: { type: Schema.Types.ObjectId, ref: 'Bot', index: true }, // Link to the bot that placed the order
  exchange: { type: String, required: true }, // e.g., 'binance'
  exchangeOrderId: { type: String, required: true, index: true }, // The ID from the exchange
  symbol: { type: String, required: true, uppercase: true },
  type: { type: String, enum: ['market', 'limit'], required: true },
  side: { type: String, enum: ['buy', 'sell'], required: true },
  status: { type: String, enum: ['open', 'closed', 'canceled', 'failed'], default: 'open' },
  price: { type: Number, required: true }, // Execution price
  amount: { type: Number, required: true }, // Amount of the asset
  cost: { type: Number, required: true }, // Total cost (price * amount)
  fee: {
    cost: { type: Number, default: 0 },
    currency: { type: String }
  },
}, { timestamps: true });

export default model('Order', orderSchema);
