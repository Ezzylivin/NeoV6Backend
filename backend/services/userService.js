// File: backend/services/userService.js

import bcrypt from 'bcryptjs';
import crypto from 'crypto'; // 👈 Needed for encryption
import User from '../models/User.js'; // Ensure this matches your filename (User.js vs user.js)
import { generateToken } from '../utils/token.js';

// 🔐 Encryption Configuration
const ALGORITHM = 'aes-256-cbc';
// Use the ENCRYPTION_KEY from .env, or fallback (only for dev)
const SECRET_KEY = process.env.ENCRYPTION_KEY || 'default_secret_key_must_be_32_bytes'; 
// Create a 32-byte key buffer from the string
const key = crypto.scryptSync(SECRET_KEY, 'salt', 32);

// --- Encryption Helpers ---
const encrypt = (text) => {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
};

const decrypt = (text) => {
  const textParts = text.split(':');
  const iv = Buffer.from(textParts.shift(), 'hex');
  const encryptedText = Buffer.from(textParts.join(':'), 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  let decrypted = decipher.update(encryptedText);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString();
};

// --- Services ---

/**
 * Registers a new user.
 */
export const registerUser = async (username, email, password) => {
  const existingUser = await User.findOne({ $or: [{ email }, { username }] });
  if (existingUser) {
    throw new Error('User with this email or username already exists');
  }

  // Password hashing is handled by the User model's pre-save hook
  const newUser = await User.create({ username, email, password });
  const token = generateToken(newUser._id);
  
  return {
    _id: newUser._id,
    username: newUser.username,
    email: newUser.email,
    token,
  };
};

/**
 * Logs in an existing user.
 */
export const loginUser = async (identifier, password) => {
  const user = await User.findOne({ $or: [{ email: identifier }, { username: identifier }] });
  if (!user) {
    throw new Error('Invalid credentials');
  }

  const isMatch = await user.comparePassword(password);
  if (!isMatch) {
    throw new Error('Invalid credentials');
  }

  const token = generateToken(user._id);

  return {
    _id: user._id,
    username: user.username,
    email: user.email,
    token,
  };
};

/**
 * Fetches a user's profile by their ID.
 */
export const getMe = async (userId) => {
  const user = await User.findById(userId).select('-password').lean();
  if (!user) {
    throw new Error('User not found');
  }
  return user;
};

/**
 * 🚀 UPDATED: Updates or adds Encrypted API keys
 */
export const updateUserApiKeys = async (userId, exchange, apiKey, apiSecret) => {
    const user = await User.findById(userId);
    if (!user) throw new Error('User not found');

    // Remove existing key for this exchange if it exists (so we don't have duplicates)
    user.apiKeys = user.apiKeys.filter(k => k.exchange !== exchange);

    // Add new key with ENCRYPTED secret
    user.apiKeys.push({ 
        exchange, 
        key: apiKey, 
        secret: encrypt(apiSecret) // 🔒 Encrypt here!
    });

    await user.save();
    
    // Return masked version for frontend
    return user.apiKeys.map(k => ({ exchange: k.exchange, last4: k.key.slice(-4) }));
};

/**
 * 🚀 NEW: Get Masked API Keys (Safe for Frontend)
 */
export const getUserApiKeys = async (userId) => {
    const user = await User.findById(userId);
    if (!user) throw new Error('User not found');

    // Map to safe objects (no secret, only last 4 of public key)
    return user.apiKeys.map(k => ({
        exchange: k.exchange,
        apiKey: k.key,
        last4: k.key.slice(-4),
        addedAt: k.addedAt
    }));
};

/**
 * 🚀 NEW: Delete an API Key
 */
export const deleteUserApiKey = async (userId, exchange) => {
    const user = await User.findById(userId);
    if (!user) throw new Error('User not found');

    // Filter out the key with the matching exchange name
    user.apiKeys = user.apiKeys.filter(k => k.exchange !== exchange);

    await user.save();
    return true;
};

// Internal Helper (Not exported normally, but useful if you need to decrypt internally)
export const internalDecrypt = decrypt;
