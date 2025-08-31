import { registerUser as registerSvc, loginUser as loginSvc, getMe as getMeSvc } from "../services/userService.js";

// --- Register ---
export const registerUser = async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ success: false, message: "Username, email, and password are required" });
    }

    const user = await registerSvc(username, email, password);

    // Separate token from user data for frontend
    const { token, ...userData } = user;
    res.json({ token, ...userData });
  } catch (err) {
    console.error('[UserController] Register error:', err.message);
    res.status(400).json({ success: false, message: err.message });
  }
};

// --- Login ---
export const loginUser = async (req, res) => {
  try {
    const { identifier, password } = req.body;

    if (!identifier || !password) {
      return res.status(400).json({ success: false, message: "Identifier and password are required" });
    }

    const user = await loginSvc(identifier, password);

    // Separate token from user data for frontend
    const { token, ...userData } = user;
    res.json({ token, ...userData });
  } catch (err) {
    console.error('[UserController] Login error:', err.message);
    res.status(400).json({ success: false, message: err.message });
  }
};

// --- Get current user ---
export const getMe = async (req, res) => {
  try {
    const user = await getMeSvc(req.user.id);
    res.json({ success: true, user });
  } catch (err) {
    console.error('[UserController] GetMe error:', err.message);
    res.status(400).json({ success: false, message: err.message });
  }
};
