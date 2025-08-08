// File: backend/models/Bot.js

import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const botSchema = new Schema(
  {
    // Links to the User who owns this bot instance
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'user',
      required: true,
      unique: true, // Enforces one bot per user
    },

    // Whether the bot's trading loop is currently active
    isRunning: {
      type: Boolean,
      default: false,
      required: true,
    },

    // Trading market symbol, e.g., 'BTC/USDT'
    symbol: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
    },

    // Trading strategy used by the bot
    strategy: {
      type: String,
      required: true,
      default: 'crossoverStrategy',
      trim: true,
    },

    // --- Configuration fields for bot operation ---
    amount: {
      type: Number,
      required: [true, 'Trade amount is required to run the bot.'],
      min: [0, 'Trade amount must be a positive number.'],
    },
    timeframes: {
      type: [String],
      required: [true, 'At least one timeframe is required.'],
      validate: {
        validator: arr => arr.length > 0,
        message: 'Timeframes array cannot be empty.',
      },
    },

    // When the bot was last started
    startedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true, // Adds createdAt and updatedAt fields
  }
);

// Optional: Add an index for faster lookups by userId
botSchema.index({ userId: 1 });

const Bot = model('bot', botSchema);

export default Bot;
