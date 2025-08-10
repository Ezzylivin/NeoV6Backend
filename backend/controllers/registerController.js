// File: backend/controllers/authController.js
import User from '../dbStructure/user.js';
import { generateToken } from '../utils/token.js';

export const registerUser = async (req, res) => {
  try {
    const { username, email, password } = req.body;

    // Check if user with email already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'Email already registered' });
    }

    // Create new user instance
    const newUser = new User({ username, email, password });

    // Save user (assumes User schema has pre-save hook to hash password)
    await newUser.save();

    // Generate JWT token for the new user
    const token = generateToken(newUser._id);

    // Return token and user info (omit sensitive info)
    res.status(201).json({
      token,
      user: {
        id: newUser._id,
        username: newUser.username,
        email: newUser.email,
        role: newUser.role,
      },
    });
  } catch (error) {
    console.error('[Register Error]', error);
    res.status(500).json({ message: 'Server error' });
  }
};
