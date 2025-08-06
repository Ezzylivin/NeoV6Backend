// File: backend/models/logModel.js
import mongoose from 'mongoose';

const logSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'user', required: true },
  message: { type: String, required: true },
  timestamp: { type: Date, default: Date.now }
});

const Log = mongoose.model('Log', logSchema);
export default Log;
