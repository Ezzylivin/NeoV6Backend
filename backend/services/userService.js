// File: src/backend/services/userService.js (Corrected)

import bcrypt from "bcryptjs";
import User from "../dbStructure/user.js";
import { generateToken } from "../utils/token.js"; 

// Renamed to camelCase: registerUser
export const registerUser = async (username, email, password) => {
  const existingUser = await User.findOne({ username, email });
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
 * @param {string} loginIdentifier - The user's email OR username for login.
 * @param {string} password - The user's plain-text password for login.
 * @returns {Promise<object>} An object containing the logged-in user and their JWT.
 */
export const loginUser = async (loginIdentifier, password) => {
  // 1. Find a user in the database where EITHER the 'email' field OR
  //    the 'username' field matches the provided loginIdentifier.
  //    The `$or` operator takes an array of query conditions.
  const user = await User.findOne({
    $or: [
      { email: loginIdentifier },
      { username: loginIdentifier }
    ]
  });

  // 2. Securely compare the provided password with the hashed password from the database.
  //    This check remains the same. It handles both a non-existent user and an incorrect password.
  if (!user || !(await bcrypt.compare(password, user.password))) {
    // We use a generic error message for security.
    // We don't want to tell an attacker whether they got the username right or the password wrong.
    throw new Error('Invalid credentials');
  }

  // 3. If the password is correct, generate a new token.
  const token = generateToken(user._id);

  // 4. Return the user data and the new token.
  return {
    token,
    user: {
      id: user._id,
      username: user.username,
      email: user.email,
    },
  };
};
