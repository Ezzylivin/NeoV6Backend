// File: backend/dbStructure/price.js
import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const priceSchema = new Schema({
  symbol: {
    type: String,
    required: true,
    uppercase: true,
    index: true,
  },
  timestamp: {
    type: Date,
    required: true,
    index: true,
  },
  open: Number,
  high: Number,
  low: Number,
  close: {
    type: Number,
    required: true,
  },
  volume: Number,
});

const Price = model('Price', priceSchema);
export default Price;
