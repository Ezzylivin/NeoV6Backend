// File: src/backend/routes/userRoutes.js (Corrected and Final)

import express from 'express';
// 1. Import your controller functions and middleware.
import { registerUser, loginUser, getMe } from '../controllers/userController.js';
import { verifyToken } from '../middleware/authMiddleware.js';

const router = express.Router();

// 2. Map the routes directly to the imported controller functions.
//    There are no inline arrow functions, which is the clean approach.

// --- Public Routes ---
// POST /api/users/register
router.post('/register', registerUser);

// POST /api/users/login
router.post('/login', loginUser);

// --- Protected Route ---
// GET /api/users/me
router.get('/me', verifyToken, getMe);


// 3. Export the fully configured router. This line is now syntactically correct.
export default router;
