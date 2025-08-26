import bcrypt from 'bcryptjs';
import User from '../models/userModel.js';
import { generateToken } from '../utils/token.js';

export const registerUser = async (username, email, password) => {
  const existingUser = await User.findOne({ $or: [{ email }, { username }] });
  if (existingUser) throw new Error('User with this email or username already exists');

  const newUser = await User.create({ username, email, password });
  const token = generateToken(newUser._id);

  return { _id: newUser._id, username: newUser.username, email: newUser.email, token };
};

export const loginUser = async (identifier, password) => {
  const user = await User.findOne({ $or: [{ email: identifier }, { username: identifier }] });
  if (!user) throw new Error('Invalid credentials');

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) throw new Error('Invalid credentials');

  const token = generateToken(user._id);
  return { _id: user._id, username: user.username, email: user.email, token };
};
