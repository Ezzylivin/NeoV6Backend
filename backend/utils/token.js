// File: backend/utils/token.js
import jwt from 'jsonwebtoken';

export const GenerateToken = (user) => {
  return jwt.sign(
    { id: user._id, username: user.username },
    process.env.JWT_SECRET,
    { expiresIn: '30d' }
  );
};

export default token;
