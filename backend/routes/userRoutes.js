// File: backend/routes/userRoutes.js (Corrected)

import express from 'express';
// Import the CONTROLLER functions, not the services
import { registerUser, loginUser } from '../controllers/authController.js';

const router = express.Router();

// @route   POST /api/user/register
// @desc    Register a new user
// @access  Public
router.post('/register', registerUser);

// @route   POST /api/user/login
// @desc    Login existing user
// @access  Public
router.post('/login', loginUser);

export default router;
