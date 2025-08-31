// File: src/backend/services/userService.js
import bcrypt from "bcryptjs";
import User from "../dbStructure/user.js";
import { generateToken } from "../utils/generateToken.js";

/**
 * Register a new user
 * @param {string} username 
 * @param {string} email 
 * @param {string} password 
 */
export const registerUser = async (username, email, password) => {
  // Check if username/email already exists
  const existingUser = await User.findOne({ $or: [{ email }, { username }] });
  if (existingUser) {
    throw new Error("User with this email or username already exists");
  }

  // Hash password
  const hashedPassword = await bcrypt.hash(password, 10);

  // Create user
  const user = await User.create({ username, email, password: hashedPassword });

  return {
    _id: user._id,
    username: user.username,
    email: user.email,
    walletBalance: user.walletBalance, // include walletBalance
    token: generateToken(user._id),
  };
};

/**
 * Login a user
 * @param {string} identifier - username or email
 * @param {string} password
 */
export const loginUser = async (identifier, password) => {
  const user = await User.findOne({ $or: [{ email: identifier }, { username: identifier }] });
  if (!user) throw new Error("Invalid credentials");

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) throw new Error("Invalid credentials");

  return {
    _id: user._id,
    username: user.username,
    email: user.email,
    walletBalance: user.walletBalance,
    token: generateToken(user._id),
  };
};
