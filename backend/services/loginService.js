import generateToken from '../utils/token.js
import user from '../dbStructure/user.js';



export const loginUser = async (email, password) => {
  const existingUser = await user.findOne({ email });

  if (!existingUser || !(await user.comparePassword(password))) {
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
