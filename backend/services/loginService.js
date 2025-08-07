import jwt from 'jsonwebtoken';
import user from '../dbStructure/user.js';

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: '30d',
  });
};

export const loginUser = async (email, password) => {
  const existingUser = await user.findOne({ email });

  if (!user || !(await user.comparePassword(password))) {
    throw new Error('Invalid email or password');
  }

  return {
    token: generateToken(user._id),
    user: {
      id: user._id,
      email: user.email,
      role: user.role,
    },
  };
};
