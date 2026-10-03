// File: backend/middleware/adminMiddleware.js
// Authorization gate for the admin panel. Runs AFTER `protect` (which populates
// req.user from the verified JWT), so it only has to check the role. There is no
// separate admin login — an account simply either has role:"admin" or it does
// not. This keeps one auth system and one attack surface.
//
// Usage:  router.get("/users", protect, requireAdmin, handler)
export const requireAdmin = (req, res, next) => {
  if (req.method === "OPTIONS") return next(); // CORS preflight
  const role = req.user && req.user.role;
  if (role !== "admin") {
    return res.status(403).json({ message: "Admin access required" });
  }
  next();
};

export default requireAdmin;
