import User from '../models/User.js';     // Modern import
import bcrypt from 'bcryptjs';          // Modern import

// @desc    Register a new user
// @route   POST /api/auth/register
export const registerUser = async (req, res) => {
  // Logic is from Option 2
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ message: 'Please provide an email and password' });
  }

  try {
    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ message: 'User with this email already exists' });
    }

    // *** The Critical Security Step from Option 2 ***
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create the user with the SECURE, hashed password
    const user = await User.create({
      email,
      password: hashedPassword,
    });

    if (user) {
      res.status(201).json({ message: 'User registered successfully' });
    } else {
      res.status(400).json({ message: 'Invalid user data' });
    }

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server Error' });
  }
};
