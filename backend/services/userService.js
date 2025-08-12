// File: src/backend/services/authService.js (Combined and Corrected)

import bcrypt from "bcryptjs";
import User from "../dbStructure/user.js";
// 1. Import the named export 'generateToken' from your token utility.
import { generateToken } from "../utils/token.js"; 

/**
 * Handles the business logic for registering a new user.
 * @param {string} username - The new user's username.
 * @param {string} email - The new user's email.
 * @param {string} password - The new user's plain-text password.
 * @returns {Promise<object>} An object containing the new user and their JWT.
 */
export const RegisterUser = async (username, email, password) => {
  // Check if a user with this email already exists
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    throw new Error("User with this email already exists");
  }

  // Hash the password for secure storage
  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(password, salt);

  // Create the new user in the database
  const newUser = await User.create({
    username,
    email,
    password: hashedPassword,
  });

  // Generate a JWT for the new user
  const token = generateToken(newUser._id);

  // Return the user data and token
  return {
    token, // This is the generated token
    user: {
      id: newUser._id,
      username: newUser.username,
      email: newUser.email,
    }
  };
};

/**
 * Handles the business logic for logging in an existing user.
 * @param {string} email - The user's email for login.
 * @param {string} password - The user's plain-text password for login.
 * @returns {Promise<object>} An object containing the logged-in user and their JWT.
 */
export const LoginUser = async (email, password) => {
  // 2. The function correctly receives 'email', not 'username'.
  const user = await User.findOne({ email });

  // 3. Securely compare the provided password with the hashed password from the database.
  //    This check handles both a non-existent user and an incorrect password.
  if (!user || !(await bcrypt.compare(password, user.password))) {
    throw new Error('Invalid email or password');
  }

  // 4. If the password is correct, generate a new token.
  const token = generateToken(user._id);

  // 5. Return the user data and the new token.
  return {
    token,
    user: {
      id: user._id,
      username: user.username,
      email: user.email,
    }
      // You can include other non-sensitive user data here if needed
      // role: user.role, 
      /**
 * Handles the business logic for retrieving the current user's profile.
 * It assumes the user has already been fetched and verified by middleware.
 * @param {object} user - The user object attached to the request by middleware (req.user).
 * @returns {object} A clean user profile object, ready to be sent as a response.
 */
export const GetMe = (user) => {
  // The 'user' object is passed in directly from the controller.
  // We check if it exists as a safeguard.
  if (!user) {
    throw new Error('User not found or not authenticated.');
  }

  // We are not returning a token here, just the user's profile data.
  return {
    id: user._id,
    username: user.username,
    email: user.email,
    // You could add other fields here, like:
    // createdAt: user.createdAt,
  };
};
    },
  };
};
