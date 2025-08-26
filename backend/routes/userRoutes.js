import express from 'express';

// 1. Import your controller functions and security middleware.
import { registerUser, loginUser, getMe } from '../controllers/userController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

// --- Public Routes (No token required) ---

// Handles POST /api/users/register
router.post('/register', registerUser);

// Handles POST /api/users/login
router.post('/login', loginUser);

// --- Protected Route (Token IS required) ---

// Handles GET /api/users/me
// The `protect` middleware runs first to protect this route.
router.get('/me', protect, getMe);

// --- Export the Router ---
export default router;
