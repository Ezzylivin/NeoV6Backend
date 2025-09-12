// File: backend/dbStructure/price.js
import mongoose from 'mongoose';
const { Schema, model } = mongoose;

const priceSchema = new Schema({
  symbol: {
    type: String,
    required: true,
    uppercase: true,
    trim: true,
  },
  timestamp: {
    type: Date,
    required: true,
  },
  open: {
    type: Number,
    required: true,
    min: [0, 'Open price must be positive']
  },
  high: {
    type: Number,
    required: true,
    min: [0, 'High price must be positive']
  },
  low: {
    type: Number,
    required: true,
    min: [0, 'Low price must be positive']
  },
  close: {
    type: Number,
    required: true,
    min: [0, 'Close price must be positive']
  },
  volume: {
    type: Number,
    default: 0,
    min: [0, 'Volume cannot be negative']
  },
  typicalPrice: Number, // (High + Low + Close) / 3
  source: {
    type: String,
    enum: ['binance', 'coinbase', 'kraken', 'manual', 'test'],
    default: 'binance'
  },
}, {
  timestamps: true,
});

// Create a unique compound index to prevent duplicate entries and speed up queries
priceSchema.index({ symbol: 1, timestamp: 1 }, { unique: true });

// Validate OHLC relationships
priceSchema.pre('validate', function(next) {
  if (this.high < this.low) {
    next(new Error('High price cannot be less than low price'));
  } else if (this.high < this.open || this.high < this.close) {
    next(new Error('High price must be >= open and close prices'));
  } else if (this.low > this.open || this.low > this.close) {
    next(new Error('Low price must be <= open and close prices'));
  } else {
    next();
  }
});

// Calculate typical price before saving
priceSchema.pre('save', function(next) {
  if (this.isModified('high') || this.isModified('low') || this.isModified('close')) {
    this.typicalPrice = (this.high + this.low + this.close) / 3;
  }
  next();
});

priceSchema.statics.getSymbolData = function(symbol, startDate, endDate, limit = 1000) {
  const query = { symbol: symbol.toUpperCase() };
  if (startDate || endDate) {
    query.timestamp = {};
    if (startDate) query.timestamp.$gte = new Date(startDate);
    if (endDate) query.timestamp.$lte = new Date(endDate);
  }
  return this.find(query).sort({ timestamp: 1 }).limit(limit).lean();
};

const Price = model('Price', priceSchema);
export default Price;
