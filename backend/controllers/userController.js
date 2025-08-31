// File: src/backend/controllers/userController.js
import * as userService from "../services/userService.js";

/**
 * Register a new user
 */
export const registerUser = async (req, res) => {
  try {
    const { username, email, password } = req.body;
    const userData = await userService.registerUser(username, email, password);
    res.status(201).json({ success: true, user: userData });
  } catch (err) {
    console.error("[UserController] Register error:", err.message);
    res.status(400).json({ success: false, message: err.message });
  }
};

/**
 * Login a user
 */
export const loginUser = async (req, res) => {
  try {
    const { identifier, password } = req.body; // identifier = username or email
    const userData = await userService.loginUser(identifier, password);
    res.status(200).json({ success: true, user: userData });
  } catch (err) {
    console.error("[UserController] Login error:", err.message);
    res.status(401).json({ success: false, message: err.message });
  }
};
