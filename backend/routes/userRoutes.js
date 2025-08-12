// File: src/backend/routes/userRoutes.js (The Gold Standard Version)

import express from 'express';

// Import controller functions and security middleware
import { registerUser, loginUser, getMe } from '../controllers/userController.js';
import { verifyToken } from '../middleware/authMiddleware.js';

const router = express.Router();

// --- Public Routes (No token required) ---
// Handles POST /api/users/register
router.post('/register', registerUser);

// Handles POST /api/users/login
router.post('/login', loginUser);


// --- Protected Route (Token IS required) ---
// Handles GET /api/users/me
// The `verifyToken` middleware runs first to protect this route.
router.get('/me', verifyToken, getMe);


// --- Export the Router ---
export default router;
