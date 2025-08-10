// backend/routes/authRoutes.js
import express from 'express';
import { registerUser } from '../services/registerService.js';
import { loginUser } from '../services/loginService.js';

const router = express.Router();

// @route   POST /api/auth/register
// @desc    Register a new user and return JWT token
// @access  Public
router.post('/auth/register', async (req, res) => {
  try {
    const { email, password, role } = req.body;
    const result = await registerUser(email, password, role);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// @route   POST /api/auth/login
// @desc    Login existing user and return JWT token
// @access  Public
router.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const result = await loginUser(email, password);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
