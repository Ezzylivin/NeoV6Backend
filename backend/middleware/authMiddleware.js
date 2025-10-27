// File: backend/middleware/authMiddleware.js
// UPGRADED: Removed syntax error and renamed function for consistency.

import jwt from "jsonwebtoken";
import User from "../dbStructure/user.js";


// Renamed from authMiddleware to 'protect' to match its usage in route files.
export const protect = async (req, res, next) => {

     console.log('--- [AUTH MIDDLEWARE] INCOMING HEADERS:', req.headers);

    console.log("🔐 protect middleware triggered. Headers:", req.headers.authorization);


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
                // Use return to stop execution
                return res.status(401).json({ message: "Not authorized, user not found" });
            }

            // Proceed to the next middleware/controller
            next();
        } else {
            return res.status(401).json({ message: "Not authorized, no token" });
            // The erroneous 'export' statement that caused the crash was here. It has been removed.
        }
    } catch (err) {
        console.error("Auth middleware error:", err.message);
        return res.status(401).json({ message: "Not authorized, token failed" });
    }
};
