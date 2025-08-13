// File: src/backend/services/userService.js

import bcrypt from "bcryptjs";
import User from "../dbStructure/user.js";
import { generateToken } from "../utils/token.js";

/**
 * Registers a new user in the system.
 * @param {string} username - The user's chosen username.
 * @param {string} email - The user's email address.
 * @param {string} password - The user's plain-text password.
 * @returns {Promise<object>} An object containing the new user and their JWT.
 */
export const registerUser = async (username, email, password) => {
  // Check if a user already exists with the same email OR username
  const existingUser = await User.findOne({
    $or: [{ email }, { username }]
  });

  if (existingUser) {
    throw new Error("User with this email or username already exists");
  }

  // Hash the password
  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(password, salt);

  // Create the user
  const newUser = await User.create({
    username,
    email,
    password: hashedPassword
  });

  // Generate JWT
  const token = generateToken(newUser._id);

  return {
    token,
    user: {
      id: newUser._id,
      username: newUser.username,
      email: newUser.email
    }
  };
};

/**
 * Logs in an existing user.
 * @param {string} loginIdentifier - The user's email OR username.
 * @param {string} password - The user's plain-text password.
 * @returns {Promise<object>} An object containing the logged-in user and their JWT.
 */
export const loginUser = async (email, password) => {
  // Find user by either email or username
  const user = await User.findOne( email );

  // Validate credentials
  if (!user || !(await bcrypt.compare(password, user.password))) {
    throw new Error("Invalid credentials");
  }

  // Generate JWT
  const token = generateToken(user._id);

  return {
    token,
    user: {
      id: user._id,
      email: user.email,
    }
  };
};
