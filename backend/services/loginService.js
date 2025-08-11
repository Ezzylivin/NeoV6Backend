// File: backend/services/loginService.js
import token from '../utils/token.js';
import User from '../dbStructure/user.js';

export const loginUser = async (username, password) => {
  const user = await User.findOne({ email });

  if (!user || !(await user.comparePassword(password))) {
    throw new Error('Invalid email or password');
  }

   const jwtToken = generateToken(newUser._id);

  return {
    token: jwtToken,
    user: {
      id: user._id,
      username: user.username,
      email: user.email,
      role: user.role,
    },
  };
};
