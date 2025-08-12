// File: backend/controllers/authController.js (Corrected)

// Import the service worker function
import { registerUser as registerUserService, loginUser as loginUserService } from '../services/userService.js';


// Controller for the REGISTER route
export const registerUser = async (req, res) => {
  try {
    const { username, email, password } = req.body;

    // Delegate all the hard work to the service
    const result = await registerUserService(username, email, password);

    // Send the successful response
    res.status(201).json(result);
  } catch (error) {
    // If the service throws an error (e.g., "User already exists"), catch it here.
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
    res.status(401).json({ message: error.message }); // 401 for bad credentials
  }
};
