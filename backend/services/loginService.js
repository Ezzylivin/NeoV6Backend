import generateToken from '../utils/token.js
import user from '../dbStructure/user.js';



export const loginUser = async (email, password) => {
  const User = await user.findOne({ email });

  if (!User || !(await existingUser.comparePassword(password))) {
    throw new Error('Invalid email or password');
  }

  return {
    token: generateToken(User._id),
    user: {
      id: User._id,
      email: User.email,
      role: User.role,
    },
  };
};
