// File: backend/services/userService.js

import bcrypt from 'bcryptjs';
import crypto from 'crypto'; // 👈 Needed for encryption
import User from '../dbStructure/user.js'; // Ensure this matches your filename (User.js vs user.js)
import { generateToken } from '../utils/token.js';

// 🔐 Encryption Configuration
// ENCRYPTION_KEY is REQUIRED — fail fast so we never silently fall back to a
// hardcoded (publicly known) key for real exchange secrets.
const SECRET_KEY = process.env.ENCRYPTION_KEY;
if (!SECRET_KEY || SECRET_KEY.length < 16) {
  throw new Error(
    "ENCRYPTION_KEY env var is required (>= 16 chars) to encrypt exchange API secrets."
  );
}

const GCM_ALGORITHM = 'aes-256-gcm';
const LEGACY_ALGORITHM = 'aes-256-cbc';
// Legacy key (old static salt) — used ONLY to decrypt values written before the
// GCM upgrade, so existing users don't have to re-enter their API keys.
const legacyKey = crypto.scryptSync(SECRET_KEY, 'salt', 32);
const deriveKey = (salt) => crypto.scryptSync(SECRET_KEY, salt, 32);

// --- Encryption Helpers ---
// New format (authenticated): gcm:<salt>:<iv>:<authTag>:<ciphertext>  (hex)
const encrypt = (text) => {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(GCM_ALGORITHM, deriveKey(salt), iv);
  const encrypted = Buffer.concat([cipher.update(String(text), 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [
    'gcm',
    salt.toString('hex'),
    iv.toString('hex'),
    authTag.toString('hex'),
    encrypted.toString('hex'),
  ].join(':');
};

const decrypt = (payload) => {
  const parts = payload.split(':');

  // New GCM format
  if (parts[0] === 'gcm') {
    const [, saltHex, ivHex, tagHex, ctHex] = parts;
    const decipher = crypto.createDecipheriv(
      GCM_ALGORITHM, deriveKey(Buffer.from(saltHex, 'hex')), Buffer.from(ivHex, 'hex')
    );
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    return Buffer.concat([
      decipher.update(Buffer.from(ctHex, 'hex')), decipher.final(),
    ]).toString('utf8');
  }

  // Legacy CBC format: <iv>:<ciphertext>
  const iv = Buffer.from(parts.shift(), 'hex');
  const encryptedText = Buffer.from(parts.join(':'), 'hex');
  const decipher = crypto.createDecipheriv(LEGACY_ALGORITHM, legacyKey, iv);
  return Buffer.concat([
    decipher.update(encryptedText), decipher.final(),
  ]).toString();
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
