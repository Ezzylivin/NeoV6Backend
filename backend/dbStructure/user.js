// File: models/User.js
// 🚀 UPGRADE: v2.1 - SaaS Commander
// 🛠 Features: Multi-Bot Persistence, Full Config Storage, Execution History

import mongoose from "mongoose";
import bcrypt from "bcryptjs";

// 🔐 Sub-Schema for Encrypted API Keys
const apiKeySchema = new mongoose.Schema({
  exchange: { type: String, required: true, default: 'coinbase' }, 
  key: { type: String, required: true },      // Public API Key
  secret: { type: String, required: true },   // ⚠️ ENCRYPTED Secret (handled by controller)
  addedAt: { type: Date, default: Date.now }
}, { _id: false });

// ⚙️ Sub-Schema for Full Bot Configuration (The "Source of Truth")
// This stores exactly what parameters a specific bot instance is running with.
const botConfigSchema = new mongoose.Schema({
  botId: { type: String, required: true }, // Format: USER_SYMBOL_TIMEFRAME
  symbol: { type: String, required: true },
  timeframe: { type: String, required: true },
  initialCapital: { type: Number, required: true },
  
  // Strategy & ML Logic
  strategies: [{
    code: String,
    params: { type: Map, of: Number }
  }],
  comboConfig: {
    strategyCodes: [String],
    combinationRule: String
  },
  mlMode: { type: String, default: 'off' },
  mlModel: String,
  mlThreshold: Number,

  // Risk Settings
  riskPercentage: Number,
  riskManagementMode: String,
  maxPyramiding: Number,
  maxDailyLoss: Number,
  
  startedAt: { type: Date, default: Date.now },
  stoppedAt: Date,
  finalStatus: String // 'stopped', 'liquidated', 'error'
}, { _id: false });

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    unique: true,
    sparse: true,
    trim: true,
    minlength: 3,
    maxlength: 30
  },
  email: {
    type: String,
    unique: true,
    sparse: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: function() { return !this.walletAddress; }, 
    minlength: 8
  },
  role: {
    type: String,
    enum: ["user", "admin", "whale"], 
    default: "user"
  },
  
  // 🚀 CRITICAL: Wallet Address (Primary ID for Web3 Users)
  walletAddress: { 
    type: String, 
    unique: true,
    sparse: true,
    lowercase: true,
    trim: true,
    index: true
  },

  // 📧 Email verification
  isVerified: { type: Boolean, default: false },
  verificationToken: { type: String, index: true },
  verificationTokenExpires: { type: Date },

  // 🔑 Password reset
  resetToken: { type: String, index: true },
  resetTokenExpires: { type: Date },

  // 🎓 First-login onboarding tour — set once, ever (per account, across devices),
  // so the guided tour only auto-shows on the user's very first login.
  onboardedAt: { type: Date },

  // 💳 SUBSCRIPTION / BILLING
  // `tier` unlocks LIVE trading and its limits (see config/tiers.js). Paper
  // trading is ALWAYS unlimited regardless of tier — tiers never touch paper.
  // `role` (above) stays separate: it's authz (admin panel), not a plan.
  tier: {
    type: String,
    enum: ["free", "trader", "pro", "whale"],
    default: "free",
  },
  // Stripe linkage (populated by the billing webhook; safe to be null until the
  // user subscribes). Admins may also set `tier` directly (comped accounts).
  stripeCustomerId: { type: String, index: true },
  stripeSubscriptionId: { type: String },
  subscriptionStatus: {
    // mirrors Stripe: trialing | active | past_due | canceled | incomplete | null
    type: String,
    default: null,
  },
  subscriptionInterval: { type: String }, // 'month' | 'year'
  currentPeriodEnd: { type: Date },
  // When an admin comps/overrides a tier by hand (bypasses Stripe), we record it
  // so the webhook won't stomp a manual grant. null = plan is Stripe-driven.
  tierManualOverride: { type: Boolean, default: false },

  // 🔐 API Keys for Trading
  apiKeys: [apiKeySchema],

  // 💾 UI Defaults (Last used settings, for convenience only)
  botPreferences: { 
    symbol: { type: String, default: 'BTC-USD' },
    timeframe: { type: String, default: '1h' },
    riskPercentage: { type: Number, default: 1 },
    riskManagementMode: { type: String, default: 'static' },
    maxPyramiding: { type: Number, default: 1 },
    mlMode: { type: String, default: 'off' },
    mlThreshold: { type: Number, default: 0.5 }
  },

  // 🤖 ACTIVE BOTS: The "Live" Instances
  // Upgrade #2: Stores full config so restarts are consistent
  activeBots: [botConfigSchema],

  // 📜 BOT HISTORY: The "Journal" (Moved here when stopped)
  botHistory: [botConfigSchema]

}, { timestamps: true });

// --- MIDDLEWARE & METHODS ---

// Hash password before save
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
    // Don't send full history unless requested to save bandwidth
    // delete ret.botHistory; 
    return ret;
  }
});

const User = mongoose.model("User", userSchema);
export default User;
