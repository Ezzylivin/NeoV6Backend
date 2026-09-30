// File: backend/middleware/authMiddleware.js
// UPGRADED: Removed syntax error and renamed function for consistency.

import jwt from "jsonwebtoken";
import User from "../dbStructure/user.js";


// Renamed from authMiddleware to 'protect' to match its usage in route files.
export const protect = async (req, res, next) => {
    // 🟢 CRITICAL FIX: Allow Preflight OPTIONS requests to bypass authentication
    // Browsers send OPTIONS without headers to check CORS safety.
    if (req.method === 'OPTIONS') {
        return next();
    }

    // SECURITY: never log req.headers — it contains the Authorization Bearer
    // token (30-day JWT). Logging it leaked usable tokens into Render logs.
    let token;

    try {
        if (req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
            token = req.headers.authorization.split(" ")[1];

            // Ensure process.env.JWT_SECRET matches what Python uses!
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            req.user = await User.findById(decoded.id).select("-password");

            if (!req.user) {
                return res.status(401).json({ message: "Not authorized, user not found" });
            }
            next();
        } else {
            return res.status(401).json({ message: "Not authorized, no token" });
        }
    } catch (err) {
        console.error("Auth middleware error:", err.message);
        // This is where "token failed" comes from
        return res.status(401).json({ message: "Not authorized, token failed" });
    }
};
