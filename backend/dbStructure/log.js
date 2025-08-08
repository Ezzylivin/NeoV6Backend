// File: backend/models/Log.js
import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const logSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'user',
      required: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true, // Adds createdAt and updatedAt
    collection: 'logs', // Optional: explicitly sets collection name
  }
);

// Use PascalCase for model name
const Log = model('log', logSchema);

export default Log;
