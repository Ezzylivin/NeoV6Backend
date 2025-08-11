// File: src/backend/middleware/authMiddleware.js

import jwt from 'jsonwebtoken';
import User from '../dbStructure/user.js'; // We need the User model to find the user

/**
 * Middleware to protect routes. It verifies the JWT from the Authorization header.
 * If the token is valid, it attaches the authenticated user object to `req.user`.
 * If not, it sends a 401 Unauthorized error.
 */
export const verifyToken = async (req, res, next) => {
  let token;

  // 1. Check if the Authorization header exists and is correctly formatted.
  //    It should look like: "Bearer <token>"
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      // 2. Extract the token from the header string.
      token = req.headers.authorization.split(' ')[1];

      // 3. Verify the token using your secret key.
      //    This will throw an error if the token is expired or the signature is invalid.
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // 4. Find the user in the database using the ID from the decoded token.
      //    We exclude the password field for security.
      //    This ensures the user still exists in our system.
      req.user = await User.findById(decoded.id).select('-password');

      // If no user is found with that ID, the token is invalid.
      if (!req.user) {
        return res.status(401).json({ message: 'Not authorized, user not found' });
      }

      // 5. If everything is successful, call `next()` to pass control to the
      //    next function in the chain (usually the main route controller).
      next();
    } catch (error) {
      console.error('Token verification failed:', error.message);
      return res.status(401).json({ message: 'Not authorized, token failed' });
    }
  }

  // If there's no token in the header at all, deny access.
  if (!token) {
    return res.status(401).json({ message: 'Not authorized, no token provided' });
  }
};
