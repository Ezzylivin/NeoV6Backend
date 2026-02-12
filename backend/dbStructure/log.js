// File: backend/dbStructure/log.js
import mongoose from 'mongoose';
const { Schema, model } = mongoose;

const logSchema = new Schema(
  {
    // 🟢 Keep as String to support both MongoDB ObjectIds and Wallet Addresses
    userId: {
      type: String,
      required: true,
      index: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
    // 🟢 Expanded levels to match your bot's "Thinking" vs "Actions"
    level: {
      type: String,
      enum: ['info', 'warn', 'error', 'debug', 'thought', 'trade'],
      default: 'thought'
    },
    // 🟢 Explicit timestamp for Time Series optimization
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    }
  },
  {
    // 🟢 MongoDB Time Series Optimization
    // This organizes data by time on the disk for massive speed gains
    timeseries: {
      timeField: 'timestamp',
      metaField: 'userId',
      granularity: 'seconds'
    },
    // 🟢 Automatic Purging
    // Deletes logs automatically after 7 days (604800 seconds)
    expireAfterSeconds: 604800, 
    collection: 'logs',
  }
);

// Create a compound index to make "Catch-Up" queries instant
logSchema.index({ userId: 1, timestamp: -1 });

const Log = model('Log', logSchema);

export default Log;
