// File: backend/dbStructure/macroData.js
import mongoose from 'mongoose';
const { Schema, model } = mongoose;

const macroDataSchema = new Schema({
  date: { type: Date, required: true, unique: true },
  fed_funds_rate: { type: Number },
  cpi: { type: Number }
}, { timestamps: true });

export default model('MacroData', macroDataSchema);
