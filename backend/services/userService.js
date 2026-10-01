// File: backend/services/userService.js

import bcrypt from 'bcryptjs';
import crypto from 'crypto'; // 👈 Needed for encryption
import User from '../dbStructure/user.js'; // Ensure this matches your filename (User.js vs user.js)
import { generateToken } from '../utils/token.js';
import { sendVerificationEmail } from '../utils/mailer.js';

const VERIFY_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const newVerifyToken = () => crypto.randomBytes(32).toString('hex');

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
  const verificationToken = newVerifyToken();
  const newUser = await User.create({
    username, email, password,
    isVerified: false,
    verificationToken,
    verificationTokenExpires: new Date(Date.now() + VERIFY_TTL_MS),
  });
  const token = generateToken(newUser._id);

  // Fire the verification email (non-fatal: a mail hiccup must not fail signup;
  // the user can resend from the in-app banner).
  try { await sendVerificationEmail(email, verificationToken); }
  catch (e) { console.error('[register] verification email failed:', e.message); }

  return {
    _id: newUser._id,
    username: newUser.username,
    email: newUser.email,
    isVerified: false,
    token,
  };
};

/**
 * Verify an email address from the token in the verification link.
 */
export const verifyEmail = async (token) => {
  if (!token) throw new Error('Missing verification token');
  const user = await User.findOne({ verificationToken: token });
  if (!user) throw new Error('Invalid or already-used verification link');
  if (user.verificationTokenExpires && user.verificationTokenExpires < new Date()) {
    throw new Error('Verification link expired — request a new one from the app');
  }
  user.isVerified = true;
  user.verificationToken = undefined;
  user.verificationTokenExpires = undefined;
  await user.save();
  return { email: user.email, isVerified: true };
};

/**
 * Regenerate + resend a verification email for a logged-in user.
 */
export const resendVerification = async (userId) => {
  const user = await User.findById(userId);
  if (!user) throw new Error('User not found');
  if (user.isVerified) return { alreadyVerified: true, email: user.email };
  user.verificationToken = newVerifyToken();
  user.verificationTokenExpires = new Date(Date.now() + VERIFY_TTL_MS);
  await user.save();
  const r = await sendVerificationEmail(user.email, user.verificationToken);
  return { sent: !!r.sent, email: user.email, reason: r.reason };
};

/**
 * Change the logged-in user's email address. Resets verification state and
 * sends a fresh verification link to the NEW address (trade alerts only go to
 * verified addresses, so the new one must be re-confirmed).
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const updateEmail = async (userId, rawEmail) => {
  const email = String(rawEmail || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email)) throw new Error('Please provide a valid email address');

  const user = await User.findById(userId);
  if (!user) throw new Error('User not found');

  if (String(user.email || '').toLowerCase() === email) {
    throw new Error('That is already your email address');
  }

  // Make sure no other account owns this address.
  const taken = await User.findOne({ email, _id: { $ne: user._id } });
  if (taken) throw new Error('That email is already in use by another account');

  user.email = email;
  user.isVerified = false;
  user.verificationToken = newVerifyToken();
  user.verificationTokenExpires = new Date(Date.now() + VERIFY_TTL_MS);
  await user.save();

  // Non-fatal: the address is already changed; the user can resend if mail hiccups.
  let sent = false, reason;
  try {
    const r = await sendVerificationEmail(user.email, user.verificationToken);
    sent = !!r.sent; reason = r.reason;
  } catch (e) {
    console.error('[updateEmail] verification email failed:', e.message);
    reason = e.message;
  }
  return { email: user.email, isVerified: false, sent, reason };
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
    isVerified: !!user.isVerified,
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

    // BE#12: map to safe objects — no secret, and only the last 4 of the public
    // key (the full key was being returned despite this comment).
    return user.apiKeys.map(k => ({
        exchange: k.exchange,
        last4: k.key.slice(-4),
        addedAt: k.addedAt
    }));
};

/**
 * SERVER-ONLY: return the DECRYPTED api key + secret for one exchange, so the
 * bot service can inject them into the engine payload when trading live.
 * NEVER return this over an HTTP response — it contains the plaintext secret.
 * Returns null if the user has no key for that exchange (or decryption fails).
 */
export const getDecryptedApiKeys = async (userId, exchange) => {
  const user = await User.findById(userId);
  if (!user) return null;
  const entry = user.apiKeys.find(k => k.exchange === exchange);
  if (!entry) return null;
  try {
    return { apiKey: entry.key, apiSecret: decrypt(entry.secret) };
  } catch (err) {
    console.error(`[userService] Failed to decrypt ${exchange} secret for ${userId}: ${err.message}`);
    return null;
  }
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
