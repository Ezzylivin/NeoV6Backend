// File: backend/utils/token.js
import jwt from 'jsonwebtoken';

export const token = (user) => {
  return jwt.sign(
    { id: user._id, username: user.username },
    process.env.JWT_SECRET,
    { expiresIn: '30d' }
  );
};
