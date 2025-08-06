// File: backend/middleware/authMiddleware.js
import User from '../dbStructure/user.js';

export const protect = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'No token provided' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const User = await User.findById(decoded.id).select('-password');

    if (!User) {
      return res.status(401).json({ message: 'User not found' });
    }

    req.user = User;
    next();
  } catch (err) {
    console.error('Auth error:', err.message);
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
};
