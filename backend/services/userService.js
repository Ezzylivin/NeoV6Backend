import bcrypt from 'bcryptjs';
import User from '../dbStructure/user.js';
import { generateToken } from '../utils/token.js'; // make sure this file exists

// --- Register ---
export const registerUser = async (username, email, password) => {
  const existingUser = await User.findOne({ $or: [{ email }, { username }] });
  if (existingUser) throw new Error('User with this email or username already exists');

  const hashedPassword = await bcrypt.hash(password, 10);
  const newUser = await User.create({ username, email, password: hashedPassword });

  const token = generateToken(newUser._id);
  return {
    _id: newUser._id,
    username: newUser.username,
    email: newUser.email,
    walletBalance: newUser.walletBalance || 0,
    token,
  };
};

// --- Login ---
export const loginUser = async (identifier, password) => {
  const user = await User.findOne({ $or: [{ email: identifier }, { username: identifier }] });
  if (!user) throw new Error('Invalid credentials');

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) throw new Error('Invalid credentials');

  const token = generateToken(user._id);
  return {
    _id: user._id,
    username: user.username,
    email: user.email,
    walletBalance: user.walletBalance || 0,
    token,
  };
};

// --- Get current user by ID ---
export const getMe = async (userId) => {
  const user = await User.findById(userId);
  if (!user) throw new Error('User not found');

  return {
    _id: user._id,
    username: user.username,
    email: user.email,
    walletBalance: user.walletBalance || 0,
  };
};

// --- Default export ---
export default { registerUser, loginUser, getMe };
