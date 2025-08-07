// File: backend/models/userModel.js
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema({
  email: { type: String, unique: true, required: [true, 'Email Required'] },
  password: { type: String, required: [true, 'Password is required'], minlength: 8 },
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
  exchangeKeys: [exchangeKeySchema],
}, { timestamps: true });

const exchangeKeySchema = new mongoose.Schema({
  exchange: { type: String, required: true }, // e.g., 'binance', 'coinbase'
  apiKey: { type: String, required: true },
  apiSecret: { type: String, required: true },
}, { _id: false });


// Hash password before save
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

// Compare password method
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

const user = mongoose.model('User', userSchema);
export default user;
