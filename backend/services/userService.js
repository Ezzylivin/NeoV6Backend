import bcrypt from "bcryptjs";
import User from "../dbStructure/user.js";
import { generateToken } from "../utils/token.js";

/**
 * Registers a new user in the system.
 * @param {string} username - The user's chosen username.
 * @param {string} email - The user's email address.
 * @param {string} password - The user's plain-text password.
 * @returns {Promise<object>} An object containing the new user's _id, username, email and JWT token.
 */
export const registerUser = async (username, email, password) => {
  console.log("NEW USER CREATED:", newUser);

  // Check if a user already exists with the same email OR username
  const existingUser = await User.findOne({
    $or: [{ email: email }, { username: username }]
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

  // Return final shape expected by controllers (Option A: service returns ready-to-send object)
  return {
    _id: newUser._id,
    username: newUser.username,
    email: newUser.email,
    token
  };
};

/**
 * Logs in an existing user.
 * Accepts either an email or a username as the identifier.
 * @param {string} identifier - The user's email OR username.
 * @param {string} password - The user's plain-text password.
 * @returns {Promise<object>} An object containing the user's _id, username, email and JWT token.
 */
export const loginUser = async (identifier, password) => {
  // Find user by either email or username
  const user = await User.findOne({
    $or: [{ email: identifier }, { username: identifier }]
  });

  // Validate credentials
  if (!user) {
    throw new Error("Invalid credentials");
  }
  const passwordMatches = await bcrypt.compare(password, user.password);
  if (!passwordMatches) {
    throw new Error("Invalid credentials");
  }

  // Generate JWT
  const token = generateToken(user._id);

  return {
    _id: user._id,
    username: user.username,
    email: user.email,
    token
  };
};
