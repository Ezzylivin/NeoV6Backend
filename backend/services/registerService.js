// File: backend/services/registerService.js
import jwt from 'jsonwebtoken';
import user from '../dbStructure/user.js';

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '30d' });
};

export const registerUser = async (email, password, role = 'user') => {
  if (!email || !password) {
    throw new Error('Please enter all fields');
  }

  const existingUser = await User.findOne({ email });
  if (existingUser) {
    throw new Error('User already exists');
  }

  const newUser = await User.create({ email, password, role });
  const token = token(newUser._id);

  return {
    token,
    user: {
      id: newUser._id,
      email: newUser.email,
      role: newUser.role,
    },
  };
};
