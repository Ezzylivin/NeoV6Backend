import { registerUser as registerSvc, loginUser as loginSvc, getMe as getMeSvc } from "../services/userService.js";

// --- Register ---
export const registerUser = async (req, res) => {
  try {
    const { username, email, password } = req.body;
    const user = await registerSvc(username, email, password);
    res.json({ success: true, user });
  } catch (err) {
    console.error('[UserController] Register error:', err.message);
    res.status(400).json({ success: false, message: err.message });
  }
};

// --- Login ---
export const loginUser = async (req, res) => {
  try {
    const { identifier, password } = req.body;
    const user = await loginSvc(identifier, password);
    res.json({ success: true, user });
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
