// File: backend/routes/authRoutes.js (Corrected)

import express from 'express';
// Import the CONTROLLER functions, not the services
import { registerUser, loginUser } from '../controllers/authController.js';

const router = express.Router();

// @route   POST /api/auth/register
// @desc    Register a new user
// @access  Public
router.post('/auth', registerUser);

// @route   POST /api/auth/login
// @desc    Login existing user
// @access  Public
router.post('/auth', loginUser);

export default router;
