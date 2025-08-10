import token from '../utils/token.js;'
import User from '../dbStructure/user.js';



export const loginUser = async (email, password) => {
  const user = await User.findOne({ email });

  if (!user || !(await existingUser.comparePassword(password))) {
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
