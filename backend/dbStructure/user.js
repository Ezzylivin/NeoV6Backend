import mongoose from "mongoose";
import bcrypt from "bcryptjs";

// 🔐 Sub-Schema for Encrypted API Keys
const apiKeySchema = new mongoose.Schema({
  exchange: { type: String, required: true }, // e.g., 'coinbase', 'binance'
  key: { type: String, required: true },      // Public API Key (Safe to show last 4)
  secret: { type: String, required: true },   // ⚠️ ENCRYPTED Secret Key (Never plain text)
  addedAt: { type: Date, default: Date.now }
}, { _id: false });

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: [true, "Username required"],
    unique: true,
    trim: true,
    minlength: 3,
    maxlength: 30
  },
  email: {
    type: String,
    required: [true, "Email required"],
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: [true, "Password required"],
    minlength: 8
  },
  role: {
    type: String,
    enum: ["user", "admin"],
    default: "user"
  },
  
  // 🚀 NEW: Web3 Wallet Address (Linked to RainbowKit)
  walletAddress: { 
    type: String, 
    lowercase: true,
    trim: true
  },

  // 🚀 UPDATED: Encrypted Keys Array
  // We renamed this from 'exchangeKeys' to 'apiKeys' to match the controller logic
  apiKeys: [apiKeySchema]

}, { timestamps: true });

// Hash password before save
userSchema.pre("save", async function(next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Clean JSON output (remove password & __v)
userSchema.set("toJSON", {
  transform: (doc, ret) => {
    delete ret.password;
    delete ret.__v;
    // Optional: Don't send full API keys array in default JSON, only when requested
    // delete ret.apiKeys; 
    return ret;
  }
});

const User = mongoose.model("User", userSchema);
export default User;
