// File: backend/models/Backtest.js

import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const tradeResultSchema = new Schema(
  {
    entryTime: Date,
    exitTime: Date,
    entryPrice: Number,
    exitPrice: Number,
    position: {
      type: String,
      enum: ['long', 'short'],
    },
    profit: Number,
    duration: Number, // in seconds or ms
    result: {
      type: String,
      enum: ['win', 'loss', 'breakeven'],
    },
  },
  { _id: false } // Prevents Mongoose from auto-generating an _id for each subdocument
);

const strategyConfigSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      default: 'crossoverStrategy',
    },
    parameters: {
      type: Schema.Types.Mixed, // Accepts any object structure
      required: false,
    },
  },
  { _id: false }
);

const backtestSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    timeframe: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },

    initialBalance: {
      type: Number,
      required: true,
      min: [0, 'Initial balance must be positive'],
    },

    finalBalance: {
      type: Number,
      required: true,
      min: [0, 'Final balance must be positive'],
    },

    profit: {
      type: Number,
      required: true,
    },

    totalTrades: {
      type: Number,
      required: true,
      min: [0, 'Total trades cannot be negative'],
    },

    candlesTested: {
      type: Number,
      required: true,
      min: [1, 'At least one candle must be tested'],
    },

    strategy: strategyConfigSchema,

    tradeBreakdown: [tradeResultSchema],
  },
  {
    timestamps: true,
  }
);

// Useful compound index for fast querying by user + recency
backtestSchema.index({ userId: 1, createdAt: -1 });

const Backtest = model('Backtest', backtestSchema);

export default Backtest;
