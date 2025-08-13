// File: src/backend/routes/userRoutes.js (Corrected)

import express from 'express';
// Import the correct controller functions and middleware
import { registerUser, loginUser, getMe } from '../controllers/userController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

// --- Public Routes ---
router.post('/register', registerUser);
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

// --- Protected Route ---
// The '/me' route is now correctly protected by the verifyToken middleware.
router.get('/me', protect, getMe);

export default router;
