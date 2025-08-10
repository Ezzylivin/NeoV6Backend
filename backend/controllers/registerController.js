// File: backend/controllers/authController.js
import { registerUser as registerService } from '../services/registerService.js';

export const registerUser = async (req, res) => {
  try {
    const { username, email, password } = req.body;

    // Delegate registration logic to the service
    const userData = await registerService(username, email, password);

    res.status(201).json({
      token: userData.token,
      user: {
        id: userData._id,
        username: userData.username,
        email: userData.email,
      },
    });
  } catch (error) {
    console.error('[Register Error]', error);
    res.status(400).json({ message: error.message || 'Registration failed' });
  }
};
