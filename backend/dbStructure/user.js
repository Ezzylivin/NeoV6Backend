// File: backend/models/User.js
import mongoose from "mongoose";
import bcrypt from "bcryptjs";

// Optional: per-user exchange credentials
const exchangeKeySchema = new mongoose.Schema({
  exchange: { type: String, required: true },  // e.g., 'binance', 'coinbase'
  apiKey: { type: String, required: true },
  apiSecret: { type: String, required: true },
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
  walletBalance: { type: Number, default: 0 }, // combined field
  exchangeKeys: [exchangeKeySchema] // optional per-user exchange credentials
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
    return ret;
  }
});

const User = mongoose.model("User", userSchema);
export default User;
