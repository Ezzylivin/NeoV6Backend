// File: backend/services/userService.js

import bcrypt from 'bcryptjs';
import User from '../dbStructure/user.js'; // Ensure this path is correct
import { generateToken } from '../utils/token.js'; // Assuming you have a token utility

/**
 * Registers a new user.
 * @param {string} username - The user's chosen username.
 * @param {string} email - The user's email address.
 * @param {string} password - The user's raw password.
 * @returns {Promise<object>} An object containing the new user and a JWT.
 */
export const registerUser = async (username, email, password) => {
  const existingUser = await User.findOne({ $or: [{ email }, { username }] });
  if (existingUser) {
    throw new Error('User with this email or username already exists');
  }

  // The password hashing is handled by the pre-save hook in the User model
  const newUser = await User.create({ username, email, password });

  const token = generateToken(newUser._id);
  
  // Return a clean user object along with the token
  return {
    _id: newUser._id,
    username: newUser.username,
    email: newUser.email,
    token,
  };
};

/**
 * Logs in an existing user.
 * @param {string} identifier - The user's email or username.
 * @param {string} password - The user's raw password.
 * @returns {Promise<object>} An object containing the user and a JWT.
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
 * @param {string} userId - The MongoDB ObjectId of the user.
 * @returns {Promise<object>} The user's profile information.
 */
export const getMe = async (userId) => {
  // The .lean() method provides a plain JavaScript object for performance
  const user = await User.findById(userId).select('-password').lean();
  if (!user) {
    throw new Error('User not found');
  }
  return user;
};

/**
 * Updates or adds API keys for a specific exchange for a user.
 * @param {string} userId - The ID of the user.
 * @param {string} exchange - The name of the exchange (e.g., 'binance').
 * @param {string} apiKey - The API key.
 * @param {string} apiSecret - The API secret.
 * @returns {Promise<Array>} The updated array of exchange keys.
 */
export const updateUserApiKeys = async (userId, exchange, apiKey, apiSecret) => {
    const user = await User.findById(userId);
    if (!user) throw new Error('User not found');

    const keyIndex = user.exchangeKeys.findIndex(k => k.exchange === exchange);

    if (keyIndex > -1) {
        // Update existing key if found
        user.exchangeKeys[keyIndex].apiKey = apiKey;
        user.exchangeKeys[keyIndex].apiSecret = apiSecret;
    } else {
        // Add a new key object to the array if not found
        user.exchangeKeys.push({ exchange, apiKey, apiSecret });
    }

    await user.save();
    return user.exchangeKeys;
};
