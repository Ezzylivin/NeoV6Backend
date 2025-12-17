// File: models/User.js
// 🚀 UPGRADE: v2.0 - SaaS Edition
// 🛠 Features: Wallet-First Auth, Bot Preferences, Encrypted Keys

import mongoose from "mongoose";
import bcrypt from "bcryptjs";

// 🔐 Sub-Schema for Encrypted API Keys
const apiKeySchema = new mongoose.Schema({
  exchange: { type: String, required: true, default: 'coinbase' }, 
  key: { type: String, required: true },      // Public API Key
  secret: { type: String, required: true },   // ⚠️ ENCRYPTED Secret (handled by controller)
  addedAt: { type: Date, default: Date.now }
}, { _id: false });

// ⚙️ Sub-Schema for User Trading Preferences (Persists UI State)
const botPreferencesSchema = new mongoose.Schema({
  symbol: { type: String, default: 'BTC-USD' },
  timeframe: { type: String, default: '1h' },
  riskPercentage: { type: Number, default: 1 },
  riskManagementMode: { type: String, default: 'static' },
  maxPyramiding: { type: Number, default: 1 },
  mlMode: { type: String, default: 'off' },
  mlThreshold: { type: Number, default: 0.5 }
}, { _id: false });

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    unique: true,
    sparse: true, // Allows null/undefined if user just connects wallet
    trim: true,
    minlength: 3,
    maxlength: 30
  },
  email: {
    type: String,
    unique: true,
    sparse: true, // Allows null/undefined
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    // Password is only required if NOT using wallet login
    required: function() { return !this.walletAddress; }, 
    minlength: 8
  },
  role: {
    type: String,
    enum: ["user", "admin", "whale"], // Added 'whale' tier
    default: "user"
  },
  
  // 🚀 CRITICAL: Wallet Address (Primary ID for Web3 Users)
  walletAddress: { 
    type: String, 
    unique: true,
    sparse: true, // Critical: Allows multiple users to have 'null' wallet (email users)
    lowercase: true,
    trim: true,
    index: true   // FAST lookup for "0x..." IDs
  },

  // 🔐 API Keys for Trading
  apiKeys: [apiKeySchema],

  // 💾 Persisted Bot Settings (So they don't reset on refresh)
  botPreferences: { type: botPreferencesSchema, default: () => ({}) },

  // 🤖 Tracking Active Bots (Syncs with Python Engine)
  activeBots: [{
    botId: String,       // e.g. "0x123..._BTC-USD_1h"
    symbol: String,
    timeframe: String,
    startedAt: { type: Date, default: Date.now }
  }]

}, { timestamps: true });

// --- MIDDLEWARE & METHODS ---

// Hash password before save (only if modified)
userSchema.pre("save", async function(next) {
  if (!this.isModified("password")) return next();
  if (this.password) {
      this.password = await bcrypt.hash(this.password, 10);
  }
  next();
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  if (!this.password) return false;
  return bcrypt.compare(candidatePassword, this.password);
};

// 🛠 HELPER: Find by Wallet OR ID
// Use this in your controller instead of findById
userSchema.statics.findByIdentity = function(idOrWallet) {
    if (idOrWallet.startsWith('0x')) {
        return this.findOne({ walletAddress: idOrWallet.toLowerCase() });
    }
    return this.findById(idOrWallet);
};

// Clean JSON output
userSchema.set("toJSON", {
  transform: (doc, ret) => {
    delete ret.password;
    delete ret.__v;
    // We KEEP apiKeys in the object but the controller should mask the secret
    return ret;
  }
});

const User = mongoose.model("User", userSchema);
export default User;
