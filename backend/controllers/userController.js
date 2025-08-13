// File: src/backend/controllers/userController.js (The Correct Version)

// It ONLY needs to import the service.
import * as userService from "../services/userService.js";

// Controller for Register
export const registerUser = async (req, res) => {
  const { username, email, password } = req.body;
  try {
    const result = await userService.registerUser(username, email, password);
    res.status(201).json(result);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Controller for Login
export const loginUser = async (req, res) => {
  const { email , password } = req.body;
  try {
    // It delegates EVERYTHING to the service. No 'User.findOne' here.
    const result = await userService.loginUser({email, password});
    res.status(200).json(result);
  } catch (error) {
    res.status(401).json({ message: error.message });
  }
};

// Controller for Get Me
export const getMe = (req, res) => {
  // It relies on the middleware and doesn't touch the database.
  res.status(200).json(req.user);
};
