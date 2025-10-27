// File: backend/dbStructure/log.js
import mongoose from 'mongoose';
const { Schema, model } = mongoose;

const logSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
    level: {
      type: String,
      enum: ['info', 'warn', 'error', 'debug'],
      default: 'info'
    }
  },
  {
    timestamps: true, // Automatically adds createdAt and updatedAt
    collection: 'logs',
  }
);

const Log = model('Log', logSchema);

export default Log;
