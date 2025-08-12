// File: backend/controllers/authController.js (Corrected)

// Import the service worker function
import { RegisterUser, LoginUser, GetMe } from '../services/userService.js';


// Controller for the REGISTER route
export const registerUser = async (req, res) => {
  try {
    const { username, email, password } = req.body;

    // Delegate all the hard work to the service
    const result = await RegisterUser(username, email, password);

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
    const result = await LoginUser(email, password);
    res.status(200).json(result);
  } catch (error) {
    res.status(401).json({ message: error.message }); // 401 for bad credentials
  }
  
  export const getMe = (req, res) => {
  try {
    // 2. The `verifyToken` middleware has already placed the full user object on `req.user`.
    //    We pass this object directly to our service function.
    const userProfile = getMeService(req.user);
    
    // 3. Send the formatted profile from the service as the response.
    res.status(200).json(userProfile);
  } catch (error) {
    // This will catch the "User not found" error from the service if req.user was somehow missing.
    res.status(401).json({ message: error.message });
  }
};
  }
};
