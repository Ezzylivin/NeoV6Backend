// File: src/controllers/userController.js
import User from "../dbStructure/user.js";
import bcrypt from "bcryptjs";
import { generateToken } from "../utils/token.js";

// --- Register ---
export const registerUser = async (req, res) => {
  try {
    const { username, email, password } = req.body;

    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existingUser) return res.status(400).json({ success: false, message: "User already exists" });

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({ username, email, password: hashedPassword });

    const token = generateToken(user._id);

    res.json({ success: true, user: { _id: user._id, username, email, walletBalance: user.walletBalance, token } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// --- Login ---
export const loginUser = async (req, res) => {
  try {
    const { identifier, password } = req.body; // identifier = email or username
    const user = await User.findOne({ $or: [{ email: identifier }, { username: identifier }] });
    if (!user) return res.status(400).json({ success: false, message: "Invalid credentials" });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(400).json({ success: false, message: "Invalid credentials" });

    const token = generateToken(user._id);

    res.json({ success: true, user: { _id: user._id, username: user.username, email: user.email, walletBalance: user.walletBalance, token } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// --- Get logged-in user ---
export const getMe = async (req, res) => {
  try {
    const userId = req.user.id; // assumes auth middleware sets req.user
    const user = await User.findById(userId).select("-password");
    if (!user) return res.status(404).json({ success: false, message: "User not found" });
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
