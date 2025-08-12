// File: src/backend/controllers/userController.js

import * as userService from "../services/userService.js";


/**
 * @desc Register a new user
 * @route POST /api/users/register
 * @access Public
 */
export const registerUser = async (req, res) => {
  const { username, email, password } = req.body;

  try {
    const result = await userService.registerUser(username, email, password);

    res.status(201).json({
      message: "User registered successfully",
      token: result.token,
      user: result.user
    });
  } catch (error) {
    res.status(400).json({ message: error.message || "Registration failed" });
  }
};

/**
 * @desc Login a user
 * @route POST /api/users/login
 * @access Public
 */
export const loginUser = async (req, res) => {
  const { loginIdentifier, password } = req.body;

  try {
    const result = await userService.loginUser(loginIdentifier, password);

    res.status(200).json({
      message: "Login successful",
      token: result.token,
      user: result.user
    });
  } catch (error) {
    res.status(401).json({ message: error.message || "Login failed" });
  }
};

/**
 * @desc Get current logged-in user
 * @route GET /api/users/me
 * @access Private
 */
export const getMe = async (req, res) => {
  try {
    const user = req.user; // Provided by verifyToken middleware
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json({
      id: user._id,
      username: user.username,
      email: user.email
    });
  } catch (error) {
    res.status(500).json({ message: "Unable to fetch user profile" });
  }
};
