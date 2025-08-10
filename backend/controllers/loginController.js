// File: backend/controllers/authController.js
import User from '../dbStructure/user.js';
import {generateToken} from '../utils/token.js';

export const loginUser = async (req, res) => {
  try {
    const { username, password } = req.body;

    // Find the user by email
    const user = await User.findOne({ email });
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Generate JWT
    const token = generateToken(user._id);

    // Respond with token and user info
    res.status(200).json({
      token,
      user: {
        id: user._id,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error('[Login Error]', error);
    res.status(500).json({ message: 'Server error' });
  }
};
