// File: src/backend/controllers/userController.js

import * as userService from "../services/userService.js";
import { generateToken } from "../utils/token.js"; // make sure this exists

// Controller for Register
export const registerUser = async (req, res) => {
  const { username, email, password } = req.body;
  try {
    const user = await userService.registerUser(username, email, password);
    res.status(201).json({
      _id: user.id,
      username: user.username,
      email: user.email,
      token: generateToken(user.id),
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Controller for Login
export const loginUser = async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await userService.loginUser({ email, password });
    res.status(200).json({
      _id: user.id,
      username: user.username,
      email: user.email,
      token: generateToken(user.id),
    });
  } catch (error) {
    res.status(401).json({ message: error.message });
  }
};

// Controller for Get Me
export const getMe = (req, res) => {
  // Relies on authentication middleware
  res.status(200).json(req.user);
};
