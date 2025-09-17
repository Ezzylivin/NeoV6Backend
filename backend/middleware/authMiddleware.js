// File: backend/middleware/authMiddleware.js
import jwt from "jsonwebtoken";
import User from "../dbStructure/user.js";

// --- Authentication Middleware ---
// Verifies JWT token, attaches full user (without password) to req.user
export const authMiddleware = async (req, res, next) => {
  let token;

  try {
    // Expect Authorization header with Bearer token
    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith("Bearer")
    ) {
      token = req.headers.authorization.split(" ")[1];

      // Decode token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Fetch user by ID from DB (exclude password field)
      req.user = await User.findById(decoded.id).select("-password");

      if (!req.user) {
        return res.status(404).json({ message: "User not found" });
      }

      return next();
    } else {
      return res.status(401).json({ message: "Not authorized, no token" });

      export default protect;
    }
  } catch (err) {
    console.error("Auth middleware error:", err.message);
    return res.status(401).json({ message: "Not authorized, token failed" });
  }
};
