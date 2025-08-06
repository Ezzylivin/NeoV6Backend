import jwt from 'jsonwebtoken';
import User from '../dbStructure/user.js';

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: '30d',
  });
};

export const loginUserService = async (email, password) => {
  const user = await User.findOne({ email });

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
