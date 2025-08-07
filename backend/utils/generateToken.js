 import jwt from 'jsonwebtoken';

const generateToken = (user._id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: '30d',
  });
};
