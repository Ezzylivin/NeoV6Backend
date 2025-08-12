// File: src/backend/controllers/userController.js (Corrected)

// Import the camelCase service functions
import { registerUser as registerUserService, loginUser as loginUserService, getMe as getMeService } from '../services/userService.js';

// Controller for the REGISTER route
export const registerUser = async (req, res) => {
  try {
    const { username, email, password } = req.body;
    const result = await registerUserService(username, email, password);
    res.status(201).json(result);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Controller for the LOGIN route
export const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;
    const result = await loginUserService(email, password);
    res.status(200).json(result);
  } catch (error) {
    res.status(401).json({ message: error.message });
  }
};

// Controller for the GET ME route (now correctly defined)
export const getMe = (req, res) => {
  try {
    const userProfile = getMeService(req.user);
    res.status(200).json(userProfile);
  } catch (error) {
    res.status(401).json({ message: error.message });
  }
};
