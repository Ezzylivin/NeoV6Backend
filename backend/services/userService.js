// File: src/backend/services/userService.js (Corrected)

import bcrypt from "bcryptjs";
import User from "../dbStructure/user.js";
import { generateToken } from "../utils/token.js"; 

// Renamed to camelCase: registerUser
export const registerUser = async (username, email, password) => {
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    throw new Error("User with this email already exists");
  }
  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(password, salt);
  const newUser = await User.create({ username, email, password: hashedPassword });
  const token = generateToken(newUser._id);
  return { token, user: { id: newUser._id, username: newUser.username, email: newUser.email } };
};

// Renamed to camelCase: loginUser
export const loginUser = async (email, password) => {
  const user = await User.findOne({ email });
  if (!user || !(await bcrypt.compare(password, user.password))) {
    throw new Error('Invalid email or password');
  }
  const token = generateToken(user._id);
  return { token, user: { id: user._id, username: user.username, email: user.email } };
};

// Renamed to camelCase: getMe
export const getMe = (user) => {
  if (!user) {
    throw new Error('User not found or not authenticated.');
  }
  return { id: user._id, username: user.username, email: user.email };
};
